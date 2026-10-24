import { db, persist } from '../db'
import { networkLatency, withIdempotency, apiError } from '../client'
import { partnerLifecycle } from '../state-machines/partnerLifecycle'
import { VersionConflictError } from '../types/common'
import type { CheckRequest, Partner } from '../types'
import { logEvent, notify } from './events'

export async function listPartners(): Promise<Partner[]> {
  await networkLatency()
  return [...db.partners].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getPartner(partnerId: string): Promise<Partner | undefined> {
  await networkLatency()
  return db.partners.find((p) => p.id === partnerId)
}

export interface CreateDraftPartnerInput {
  legalName: string
  taxId: string
  kpp?: string
  ogrn: string
  legalForm: Partner['legalForm']
  address: string
  signatoryName: string
  signatoryBasis: string
  contactEmail: string
  contactPhone: string
}

export async function createDraftPartner(
  input: CreateDraftPartnerInput,
  idempotencyKey?: string,
): Promise<Partner> {
  await networkLatency()
  return withIdempotency(idempotencyKey, input, () => {
    const now = new Date().toISOString()
    const partner: Partner = {
      id: `p-${crypto.randomUUID().slice(0, 8)}`,
      ...input,
      lifecycleStatus: 'draft',
      riskStatus: null,
      kamUserId: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }
    db.partners.push(partner)
    logEvent({
      type: 'partner.draft.created',
      actorId: 'system',
      actorLabel: 'Партнёр',
      partnerId: partner.id,
      entityType: 'partner',
      entityId: partner.id,
      summary: `Черновик организации «${partner.legalName}» сохранён`,
    })
    persist()
    return partner
  })
}

export async function patchPartner(
  partnerId: string,
  patch: Partial<CreateDraftPartnerInput>,
  expectedVersion: number,
): Promise<Partner> {
  await networkLatency()
  const partner = db.partners.find((p) => p.id === partnerId)
  if (!partner) throw apiError('NOT_FOUND', 'Партнёр не найден')
  if (partner.version !== expectedVersion) throw new VersionConflictError('Партнёр')

  Object.assign(partner, patch, { updatedAt: new Date().toISOString(), version: partner.version + 1 })
  persist()
  return partner
}

export interface BrandAssetInput {
  kind: 'logo' | 'product'
  dataUrl: string
  fileName: string
}

/** Материалы бренда + согласие на использование товарного знака (шаг «Бренд»). */
export async function saveBrandAssets(partnerId: string, input: BrandAssetInput): Promise<Partner> {
  await networkLatency()
  const partner = db.partners.find((p) => p.id === partnerId)
  if (!partner) throw apiError('NOT_FOUND', 'Партнёр не найден')
  const now = new Date().toISOString()
  Object.assign(partner, {
    brandAssetKind: input.kind,
    brandAssetDataUrl: input.dataUrl,
    brandAssetName: input.fileName,
    trademarkConsentAt: now,
    updatedAt: now,
    version: partner.version + 1,
  })
  logEvent({
    type: 'partner.brand.saved',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId,
    entityType: 'partner',
    entityId: partnerId,
    summary: `Загружены материалы бренда (${input.kind === 'logo' ? 'логотип' : 'фото товара'}), получено согласие на использование товарного знака`,
  })
  persist()
  return partner
}

export async function submitPartnerForCheck(partnerId: string): Promise<{ partner: Partner; check: CheckRequest }> {
  await networkLatency()
  const partner = db.partners.find((p) => p.id === partnerId)
  if (!partner) throw apiError('NOT_FOUND', 'Партнёр не найден')

  if (partner.lifecycleStatus === 'draft') {
    partner.lifecycleStatus = partnerLifecycle.nextState(partner.lifecycleStatus, 'submit')
  }
  partner.lifecycleStatus = partnerLifecycle.nextState(partner.lifecycleStatus, 'start_check')
  partner.updatedAt = new Date().toISOString()
  partner.version += 1

  const check: CheckRequest = {
    id: `chk-${crypto.randomUUID().slice(0, 8)}`,
    partnerId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    riskLevel: null,
    reason: null,
    reviewerId: null,
    reviewerLabel: null,
    decidedAt: null,
  }
  db.checkRequests.push(check)
  logEvent({
    type: 'partner.check.requested',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId,
    entityType: 'partner',
    entityId: partnerId,
    summary: `Организация «${partner.legalName}» отправлена на проверку`,
  })
  persist()
  return { partner, check }
}

/** Через сколько автоматически одобрять низкий риск, если ни один сотрудник не принял
 *  решение вручную — имитация автоматического риск-скоринга, которым реальные
 *  платформы закрывают большинство заявок без участия человека. Партнёр не ждёт
 *  сотрудника, чтобы пройти весь путь самостоятельно; ручное решение (в т.ч. отказ)
 *  по-прежнему возможно в любой момент до срабатывания таймера — из очереди admin. */
export const AUTO_APPROVE_DELAY_MS = 5_000

function autoResolvePendingChecks(partnerId?: string): void {
  const now = Date.now()
  const pending = db.checkRequests.filter(
    (c) => c.status === 'pending' && (!partnerId || c.partnerId === partnerId) && now - new Date(c.createdAt).getTime() > AUTO_APPROVE_DELAY_MS,
  )
  for (const check of pending) {
    applyCheckDecision(check, 'approve', null, 'Автоматическая проверка (демо)', 'system-autocheck')
  }
  if (pending.length > 0) persist()
}

export async function listCheckRequests(partnerId?: string): Promise<CheckRequest[]> {
  await networkLatency()
  autoResolvePendingChecks(partnerId)
  return db.checkRequests
    .filter((c) => !partnerId || c.partnerId === partnerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type CheckDecision = 'approve' | 'reject' | 'request_info'

/** Общая логика решения по проверке — используется и ручным решением сотрудника
 *  (decideCheckRequest), и автоматическим демо-одобрением (autoResolvePendingChecks). */
function applyCheckDecision(
  check: CheckRequest,
  decision: CheckDecision,
  reason: string | null,
  reviewerLabel: string,
  reviewerId: string,
): void {
  const partner = db.partners.find((p) => p.id === check.partnerId)
  if (!partner) return

  const action = decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'request_info'
  partner.lifecycleStatus = partnerLifecycle.nextState(partner.lifecycleStatus, action)
  partner.updatedAt = new Date().toISOString()
  partner.version += 1

  check.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_info'
  check.reason = reason
  check.riskLevel = decision === 'reject' ? 'high' : decision === 'request_info' ? 'medium' : 'low'
  check.reviewerId = reviewerId
  check.reviewerLabel = reviewerLabel
  check.decidedAt = new Date().toISOString()
  if (decision === 'approve') partner.riskStatus = check.riskLevel

  notify({
    partnerId: partner.id,
    severity: decision === 'reject' ? 'critical' : 'normal',
    title:
      decision === 'approve'
        ? 'Проверка пройдена'
        : decision === 'reject'
          ? 'Проверка отклонена'
          : 'Проверка требует уточнений',
    entityType: 'partner',
    entityId: partner.id,
  })
  logEvent({
    type: `partner.check.${check.status}`,
    actorId: reviewerId,
    actorLabel: reviewerLabel,
    partnerId: partner.id,
    entityType: 'partner',
    entityId: partner.id,
    summary: `Решение по проверке: ${check.status}${reason ? ' — ' + reason : ''}`,
  })

  void maybeActivatePartner(partner.id)
}

export async function decideCheckRequest(
  checkRequestId: string,
  decision: CheckDecision,
  reason: string | null,
  reviewerLabel: string,
  reviewerId: string,
): Promise<CheckRequest> {
  await networkLatency()
  const check = db.checkRequests.find((c) => c.id === checkRequestId)
  if (!check) throw apiError('NOT_FOUND', 'Заявка на проверку не найдена')
  if (!db.partners.some((p) => p.id === check.partnerId)) throw apiError('NOT_FOUND', 'Партнёр не найден')

  applyCheckDecision(check, decision, reason, reviewerLabel, reviewerId)
  persist()
  return check
}

/** Guard из MED_HANDOFF/08_STATE_MACHINES.md: active требует и пройденной проверки,
 *  и принятых документов. Вызывается после решения по проверке и после акцепта оферты. */
export async function maybeActivatePartner(partnerId: string): Promise<void> {
  const partner = db.partners.find((p) => p.id === partnerId)
  if (!partner || partner.lifecycleStatus !== 'approved') return

  const effectiveOffer = db.documentVersions.find((d) => d.type === 'offer_agreement' && d.status === 'effective')
  const hasAcceptance = effectiveOffer
    ? db.acceptances.some((a) => a.partnerId === partnerId && a.documentVersionId === effectiveOffer.id)
    : false
  if (!hasAcceptance) return

  partner.lifecycleStatus = partnerLifecycle.nextState(partner.lifecycleStatus, 'activate')
  partner.updatedAt = new Date().toISOString()
  partner.version += 1
  notify({
    partnerId,
    severity: 'normal',
    title: 'Партнёр активирован — можно публиковать офферы',
    entityType: 'partner',
    entityId: partnerId,
  })
  logEvent({
    type: 'partner.activated',
    actorId: 'system',
    actorLabel: 'Платформа',
    partnerId,
    entityType: 'partner',
    entityId: partnerId,
    summary: 'Партнёр активирован: проверка пройдена и документы приняты',
  })
}
