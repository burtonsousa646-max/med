import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import { offerLifecycle } from '../state-machines/offerLifecycle'
import { VersionConflictError } from '../types/common'
import type { CommissionModel, Offer, OfferMechanic, OfferModel, OfferVersion } from '../types'
import { logEvent, notify } from './events'
import { generateDemoActivityForOffer } from './demoActivity'
import { deriveOfferModel } from '@/content/offerModels'

export interface ModerationQueueItem {
  version: OfferVersion
  offer: Offer
  partnerName: string
}

/** Очередь модерации для admin: версии офферов всех партнёров, ожидающие решения. */
export async function listModerationQueue(): Promise<ModerationQueueItem[]> {
  await networkLatency()
  autoResolveInReviewOffers()
  return db.offerVersions
    .filter((v) => v.moderationStatus === 'in_review')
    .map((version) => {
      const offer = db.offers.find((o) => o.id === version.offerId)!
      const partner = db.partners.find((p) => p.id === version.partnerId)
      return { version, offer, partnerName: partner?.legalName ?? version.partnerId }
    })
    .sort((a, b) => (a.version.submittedForReviewAt ?? a.version.createdAt).localeCompare(b.version.submittedForReviewAt ?? b.version.createdAt))
}

export async function listOffers(partnerId: string): Promise<Offer[]> {
  await networkLatency()
  autoResolveInReviewOffers(partnerId)
  return db.offers.filter((o) => o.partnerId === partnerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Модель оффера по последней версии каждого оффера партнёра (для каталога). */
export async function listOfferModels(partnerId: string): Promise<Record<string, OfferModel>> {
  await networkLatency()
  const result: Record<string, OfferModel> = {}
  for (const offer of db.offers.filter((o) => o.partnerId === partnerId)) {
    const latest = db.offerVersions
      .filter((v) => v.offerId === offer.id)
      .sort((a, b) => b.revision - a.revision)[0]
    if (latest) result[offer.id] = latest.monetizationModel ?? deriveOfferModel(latest.mechanic, latest.commissionModel)
  }
  return result
}

export async function getOffer(offerId: string): Promise<Offer | undefined> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  if (offer) autoResolveInReviewOffers(offer.partnerId)
  return db.offers.find((o) => o.id === offerId)
}

export async function listOfferVersions(offerId: string): Promise<OfferVersion[]> {
  await networkLatency()
  const anyVersion = db.offerVersions.find((v) => v.offerId === offerId)
  if (anyVersion) autoResolveInReviewOffers(anyVersion.partnerId)
  return db.offerVersions
    .filter((v) => v.offerId === offerId)
    .sort((a, b) => b.revision - a.revision)
}

export async function getOfferVersion(versionId: string): Promise<OfferVersion | undefined> {
  await networkLatency()
  return db.offerVersions.find((v) => v.id === versionId)
}

/** Опубликованная версия, действующая для оффера прямо сейчас — immutable snapshot. */
export async function getLiveOfferVersion(offerId: string): Promise<OfferVersion | undefined> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  if (!offer?.currentLiveVersion) return undefined
  return db.offerVersions.find((v) => v.offerId === offerId && v.revision === offer.currentLiveVersion)
}

export interface OfferDraftInput {
  partnerId: string
  title: string
  mechanic: OfferMechanic
  monetizationModel?: OfferModel
  benefit: string
  description: string
  couponPriceMinor: number
  servicePriceMinor: number
  region: string
  startDate: string
  endDate: string
  usageRules: string
  refundRules: string
  supportContact: string
  commissionModel: CommissionModel
  outletIds: string[]
  iconDataUrl?: string | null
}

function nextRevision(offerId: string): number {
  const revisions = db.offerVersions.filter((v) => v.offerId === offerId).map((v) => v.revision)
  return revisions.length ? Math.max(...revisions) + 1 : 1
}

export async function createOfferDraft(input: OfferDraftInput): Promise<{ offer: Offer; version: OfferVersion }> {
  await networkLatency()
  const now = new Date().toISOString()
  const offerId = `off-${crypto.randomUUID().slice(0, 8)}`
  const offer: Offer = {
    id: offerId,
    partnerId: input.partnerId,
    title: input.title,
    currentLiveVersion: null,
    lifecycleStatus: 'draft',
    createdAt: now,
    updatedAt: now,
  }
  const version = buildVersion(offer, 1, input, now)
  db.offers.push(offer)
  db.offerVersions.push(version)
  logEvent({
    type: 'offer.draft.created',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: input.partnerId,
    entityType: 'offer',
    entityId: offerId,
    summary: `Черновик оффера «${input.title}» создан`,
  })
  persist()
  return { offer, version }
}

/** Публикация live-версии не мутируется: правка активного оффера создаёт новую draft-версию. */
export async function createNewDraftVersion(offerId: string, input: OfferDraftInput): Promise<OfferVersion> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  if (!offer) throw apiError('NOT_FOUND', 'Оффер не найден')
  const now = new Date().toISOString()
  const version = buildVersion(offer, nextRevision(offerId), input, now)
  db.offerVersions.push(version)
  offer.title = input.title
  offer.updatedAt = now
  persist()
  return version
}

function buildVersion(offer: Offer, revision: number, input: OfferDraftInput, now: string): OfferVersion {
  return {
    id: `${offer.id}-v${revision}`,
    offerId: offer.id,
    partnerId: input.partnerId,
    revision,
    mechanic: input.mechanic,
    monetizationModel: input.monetizationModel,
    benefit: input.benefit,
    description: input.description,
    couponPrice: { amountMinor: input.couponPriceMinor, currency: 'RUB' },
    servicePrice: { amountMinor: input.servicePriceMinor, currency: 'RUB' },
    region: input.region,
    startDate: input.startDate,
    endDate: input.endDate,
    usageRules: input.usageRules,
    refundRules: input.refundRules,
    supportContact: input.supportContact,
    commissionModel: input.commissionModel,
    outletIds: input.outletIds,
    iconDataUrl: input.iconDataUrl ?? null,
    moderationStatus: 'draft',
    moderationNotes: [],
    createdAt: now,
    submittedForReviewAt: null,
  }
}

export async function submitOfferForModeration(offerId: string, versionId: string): Promise<OfferVersion> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  const version = db.offerVersions.find((v) => v.id === versionId)
  if (!offer || !version) throw apiError('NOT_FOUND', 'Оффер не найден')

  // Повторный submit того же черновика идемпотентен — не плодит дублирующие заявки.
  if (version.moderationStatus !== 'in_review') {
    version.moderationStatus = offerLifecycle.nextState(version.moderationStatus, 'submit_for_review')
    version.submittedForReviewAt = new Date().toISOString()
  }
  if (offer.lifecycleStatus === 'draft' || offer.lifecycleStatus === 'changes_requested') {
    offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, 'submit_for_review')
  }
  offer.updatedAt = new Date().toISOString()

  logEvent({
    type: 'offer.submitted',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: offer.partnerId,
    entityType: 'offer',
    entityId: offer.id,
    summary: `Оффер «${offer.title}» отправлен на модерацию`,
  })
  persist()
  return version
}

export type ModerationDecision = 'approve' | 'request_changes' | 'reject'

/** Общая логика решения по модерации — используется и ручным решением модератора
 *  (moderateOfferVersion), и автоматической демо-модерацией (autoResolveInReviewOffers). */
function applyModerationDecision(
  version: OfferVersion,
  offer: Offer,
  decision: ModerationDecision,
  note: string | null,
  moderatorLabel: string,
): void {
  const action = decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'request_changes'
  version.moderationStatus = offerLifecycle.nextState(version.moderationStatus, action)
  offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, action)
  if (note) {
    version.moderationNotes.push({
      id: `${version.id}-note-${version.moderationNotes.length + 1}`,
      field: null,
      message: note,
      authorLabel: moderatorLabel,
      createdAt: new Date().toISOString(),
    })
  }

  if (decision === 'approve') {
    const isFirstPublish = offer.currentLiveVersion === null
    offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, 'schedule')
    offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, 'publish')
    version.moderationStatus = 'published'
    offer.currentLiveVersion = version.revision
    // Только при первой публикации — иначе повторные правки/тесты бесконтрольно плодили бы заказы.
    if (isFirstPublish) generateDemoActivityForOffer(version, offer.title)
  }
  offer.updatedAt = new Date().toISOString()

  notify({
    partnerId: offer.partnerId,
    severity: decision === 'reject' ? 'critical' : 'normal',
    title:
      decision === 'approve'
        ? `Оффер «${offer.title}» опубликован`
        : decision === 'reject'
          ? `Оффер «${offer.title}» отклонён`
          : `Оффер «${offer.title}» требует правок`,
    entityType: 'offer',
    entityId: offer.id,
  })
  logEvent({
    type: `offer.${decision}`,
    actorId: 'system',
    actorLabel: moderatorLabel,
    partnerId: offer.partnerId,
    entityType: 'offer',
    entityId: offer.id,
    summary: `Модерация: ${decision}${note ? ' — ' + note : ''}`,
  })
}

export async function moderateOfferVersion(
  versionId: string,
  decision: ModerationDecision,
  note: string | null,
  moderatorLabel: string,
): Promise<OfferVersion> {
  await networkLatency()
  const version = db.offerVersions.find((v) => v.id === versionId)
  if (!version) throw apiError('NOT_FOUND', 'Версия оффера не найдена')
  const offer = db.offers.find((o) => o.id === version.offerId)
  if (!offer) throw apiError('NOT_FOUND', 'Оффер не найден')
  if (version.moderationStatus !== 'in_review') {
    throw new VersionConflictError('Оффер уже обработан другим модератором либо изменился')
  }

  applyModerationDecision(version, offer, decision, note, moderatorLabel)
  persist()
  return version
}

/** Через сколько автоматически публиковать оффер, если ни один модератор не принял
 *  решение вручную — та же логика, что и автопроверка партнёра (partners.ts):
 *  партнёр должен иметь возможность пройти весь путь, включая первую публикацию,
 *  в одиночку. Ручная модерация (в т.ч. отказ/правки) по-прежнему доступна в любой
 *  момент до срабатывания таймера — из очереди admin. */
export const AUTO_MODERATE_DELAY_MS = 20_000

function autoResolveInReviewOffers(partnerId?: string): void {
  const now = Date.now()
  const due = db.offerVersions.filter(
    (v) =>
      v.moderationStatus === 'in_review' &&
      (!partnerId || v.partnerId === partnerId) &&
      now - new Date(v.submittedForReviewAt ?? v.createdAt).getTime() > AUTO_MODERATE_DELAY_MS,
  )
  for (const version of due) {
    const offer = db.offers.find((o) => o.id === version.offerId)
    if (!offer) continue
    applyModerationDecision(version, offer, 'approve', null, 'Автоматическая модерация (демо)')
  }
  if (due.length > 0) persist()
}

export async function requestOfferPause(offerId: string): Promise<Offer> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  if (!offer) throw apiError('NOT_FOUND', 'Оффер не найден')
  offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, 'pause')
  offer.updatedAt = new Date().toISOString()
  persist()
  return offer
}

export async function resumeOffer(offerId: string): Promise<Offer> {
  await networkLatency()
  const offer = db.offers.find((o) => o.id === offerId)
  if (!offer) throw apiError('NOT_FOUND', 'Оффер не найден')
  offer.lifecycleStatus = offerLifecycle.nextState(offer.lifecycleStatus, 'resume')
  offer.updatedAt = new Date().toISOString()
  persist()
  return offer
}
