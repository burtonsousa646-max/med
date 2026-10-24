import { daysAgoIso, intBetween, mulberry32, pick, type RandomFn } from '@/utils/rng'
import { emptyDatabase, type Database } from './schema'
import type { Offer, OfferVersion, Order, OrderAction, Partner } from '../types'
import { applyOrderAction } from '../state-machines/orderLifecycle'
import { OFFER_AGREEMENT_TEXT, NDA_TEXT } from './legalTexts'
import { PUBLIC_OFFER_META } from '@/content/publicOffer'

const SEED = 20260930

/** Пары «партии кодов → уже выданные заказы» строятся так, чтобы период в аналитике/расчётах
 *  реально менял цифры — заказы разбросаны по последним 120 дням от момента генерации. */
export function buildSeedDatabase(now: string = new Date().toISOString()): Database {
  const rnd = mulberry32(SEED)
  const db = emptyDatabase()

  seedPartnersAndOutlets(db)
  seedMemberships(db)
  seedDocuments(db)
  seedCheckRequests(db, rnd, now)
  seedIntegrations(db)
  const offerVersions = seedOffers(db, rnd, now)
  seedOrdersAndSettlements(db, rnd, now, offerVersions)
  seedSupportAndNotifications(db, rnd, now)

  return db
}

function seedPartnersAndOutlets(db: Database) {
  const partners: Array<Omit<Partner, 'createdAt' | 'updatedAt' | 'version'>> = [
    {
      id: 'p-1',
      legalName: 'ООО «Мёд Страхование»',
      taxId: '7701234567',
      ogrn: '1157746112233',
      legalForm: 'ООО',
      address: 'г. Москва, ул. Тверская, д. 1',
      signatoryName: 'Соколова Анна Викторовна',
      signatoryBasis: 'Устав',
      bankName: 'АО «Банк Партнёр»',
      bik: '044525225',
      accountNumber: '40702810900000012345',
      contactEmail: 'partner@med-insurance.demo',
      contactPhone: '+7 495 000-00-01',
      lifecycleStatus: 'active',
      riskStatus: 'low',
      kamUserId: 'u-kam',
    },
    {
      id: 'p-2',
      legalName: 'ИП Петров Сергей Николаевич',
      taxId: '772812345601',
      ogrn: '316774600123456',
      legalForm: 'ИП',
      address: 'г. Казань, ул. Баумана, д. 12',
      signatoryName: 'Петров Сергей Николаевич',
      signatoryBasis: 'Свидетельство ИП',
      contactEmail: 'petrov@fastdelivery.demo',
      contactPhone: '+7 843 000-00-02',
      lifecycleStatus: 'submitted',
      riskStatus: null,
      kamUserId: 'u-kam',
    },
    {
      id: 'p-3',
      legalName: 'ООО «Профи Сервис»',
      taxId: '7802345678',
      ogrn: '1147847001234',
      legalForm: 'ООО',
      address: 'г. Санкт-Петербург, Невский пр., д. 90',
      signatoryName: 'Кузнецов Олег Дмитриевич',
      signatoryBasis: 'Устав',
      contactEmail: 'partner@profiservice.demo',
      contactPhone: '+7 812 000-00-03',
      lifecycleStatus: 'checking',
      riskStatus: 'medium',
      kamUserId: 'u-kam',
    },
    {
      id: 'p-4',
      legalName: 'ООО «СберЗдоровье Партнёр»',
      taxId: '7703456789',
      ogrn: '1157746112244',
      legalForm: 'ООО',
      address: 'г. Москва, Ленинградский пр-т, д. 37',
      signatoryName: 'Дорохова Мария Игоревна',
      signatoryBasis: 'Доверенность №14 от 01.03.2026',
      bankName: 'ПАО «Банк Здоровье»',
      bik: '044525999',
      accountNumber: '40702810900000054321',
      contactEmail: 'partner@health-consult.demo',
      contactPhone: '+7 495 000-00-04',
      lifecycleStatus: 'active',
      riskStatus: 'low',
      kamUserId: 'u-kam',
    },
    {
      id: 'p-5',
      legalName: 'ООО «Полёт Трэвел»',
      taxId: '7704567890',
      ogrn: '1157746112255',
      legalForm: 'ООО',
      address: 'г. Сочи, ул. Курортный пр-т, д. 50',
      signatoryName: 'Волков Игорь Станиславович',
      signatoryBasis: 'Устав',
      contactEmail: 'partner@polettravel.demo',
      contactPhone: '+7 862 000-00-05',
      lifecycleStatus: 'suspended',
      riskStatus: 'high',
      kamUserId: 'u-kam',
    },
    {
      id: 'p-6',
      legalName: 'ИП Смирнова Елена Павловна',
      taxId: '502912345602',
      ogrn: '318500000123457',
      legalForm: 'ИП',
      address: 'г. Нижний Новгород, ул. Большая Покровская, д. 5',
      signatoryName: 'Смирнова Елена Павловна',
      signatoryBasis: 'Свидетельство ИП',
      contactEmail: 'smirnova@homeclean.demo',
      contactPhone: '+7 831 000-00-06',
      lifecycleStatus: 'draft',
      riskStatus: null,
      kamUserId: null,
    },
  ]

  for (const p of partners) {
    db.partners.push({ ...p, createdAt: '2026-06-01T09:00:00Z', updatedAt: '2026-09-20T09:00:00Z', version: 1 })
  }

  db.outlets.push(
    {
      id: 'out-1',
      partnerId: 'p-1',
      name: 'Онлайн-точка — оформление страховки',
      address: 'Онлайн',
      online: true,
      timezone: 'Europe/Moscow',
      hours: 'Круглосуточно',
      status: 'active',
      createdAt: '2026-06-02T09:00:00Z',
      updatedAt: '2026-06-02T09:00:00Z',
    },
    {
      id: 'out-4a',
      partnerId: 'p-4',
      name: 'Онлайн-консультация',
      address: 'Онлайн',
      online: true,
      timezone: 'Europe/Moscow',
      hours: 'Пн–Вс, 08:00–22:00',
      status: 'active',
      createdAt: '2026-06-05T09:00:00Z',
      updatedAt: '2026-06-05T09:00:00Z',
    },
  )
}

function seedMemberships(db: Database) {
  db.memberships.push(
    {
      id: 'u-owner',
      partnerId: 'p-1',
      userId: 'u-owner',
      displayName: 'Анна Соколова',
      email: 'a.sokolova@med-insurance.demo',
      scope: 'partner',
      role: 'owner',
      status: 'active',
      invitedAt: '2026-06-01T09:00:00Z',
    },
    {
      id: 'u-editor',
      partnerId: 'p-1',
      userId: 'u-editor',
      displayName: 'Игорь Панкратов',
      email: 'i.pankratov@med-insurance.demo',
      scope: 'partner',
      role: 'offer_editor',
      status: 'active',
      invitedAt: '2026-06-03T09:00:00Z',
    },
    {
      id: 'u-finance',
      partnerId: 'p-1',
      userId: 'u-finance',
      displayName: 'Мария Дорохова',
      email: 'm.dorohova@med-insurance.demo',
      scope: 'partner',
      role: 'finance',
      status: 'active',
      invitedAt: '2026-06-03T09:00:00Z',
    },
    {
      id: 'u-kam',
      partnerId: null,
      userId: 'u-kam',
      displayName: 'Дмитрий Носов',
      email: 'd.nosov@beeline.demo',
      scope: 'internal',
      role: 'kam',
      status: 'active',
      invitedAt: '2026-05-01T09:00:00Z',
    },
    {
      id: 'u-moderator',
      partnerId: null,
      userId: 'u-moderator',
      displayName: 'Елена Гурьева',
      email: 'e.guryeva@beeline.demo',
      scope: 'internal',
      role: 'moderator',
      status: 'active',
      invitedAt: '2026-05-01T09:00:00Z',
    },
    {
      id: 'u-finance-internal',
      partnerId: null,
      userId: 'u-finance-internal',
      displayName: 'Павел Ситников',
      email: 'p.sitnikov@beeline.demo',
      scope: 'internal',
      role: 'finance_internal',
      status: 'active',
      invitedAt: '2026-05-01T09:00:00Z',
    },
  )
}

function seedDocuments(db: Database) {
  db.documentVersions.push(
    {
      id: 'doc-offer-v3',
      type: 'offer_agreement',
      version: 3,
      title: PUBLIC_OFFER_META.documentTitle,
      contentSummary: PUBLIC_OFFER_META.summary,
      fullText: OFFER_AGREEMENT_TEXT,
      effectiveAt: '2026-08-01T00:00:00Z',
      status: 'effective',
    },
    {
      id: 'doc-nda-v1',
      type: 'nda',
      version: 1,
      title: 'Соглашение о конфиденциальности',
      contentSummary: 'Условия неразглашения коммерческих условий и клиентских данных.',
      fullText: NDA_TEXT,
      effectiveAt: '2026-06-01T00:00:00Z',
      status: 'effective',
    },
  )
  db.acceptances.push(
    {
      id: 'acc-p1',
      partnerId: 'p-1',
      documentVersionId: 'doc-offer-v3',
      signatoryId: 'u-owner',
      signatoryLabel: 'Соколова Анна Викторовна',
      authorityRef: 'Устав',
      acceptedAt: '2026-08-02T10:00:00Z',
    },
    {
      id: 'acc-p4',
      partnerId: 'p-4',
      documentVersionId: 'doc-offer-v3',
      signatoryId: 'u-p4-signatory',
      signatoryLabel: 'Дорохова Мария Игоревна',
      authorityRef: 'Доверенность №14 от 01.03.2026',
      acceptedAt: '2026-08-05T10:00:00Z',
    },
  )
}

function seedCheckRequests(db: Database, rnd: RandomFn, now: string) {
  db.checkRequests.push(
    {
      id: 'chk-p2',
      partnerId: 'p-2',
      createdAt: daysAgoIso(rnd, 3, now),
      status: 'pending',
      riskLevel: null,
      reason: null,
      reviewerId: null,
      reviewerLabel: null,
      decidedAt: null,
    },
    {
      id: 'chk-p3',
      partnerId: 'p-3',
      createdAt: daysAgoIso(rnd, 6, now),
      status: 'needs_info',
      riskLevel: 'medium',
      reason: 'Не приложена копия договора аренды точки исполнения услуги',
      reviewerId: 'u-kam',
      reviewerLabel: 'Дмитрий Носов',
      decidedAt: daysAgoIso(rnd, 2, now),
    },
    {
      id: 'chk-p1',
      partnerId: 'p-1',
      createdAt: '2026-06-04T09:00:00Z',
      status: 'approved',
      riskLevel: 'low',
      reason: null,
      reviewerId: 'u-kam',
      reviewerLabel: 'Дмитрий Носов',
      decidedAt: '2026-06-06T09:00:00Z',
    },
  )
}

function seedIntegrations(db: Database) {
  db.integrations.push(
    {
      id: 'int-p1',
      partnerId: 'p-1',
      level: 'L1',
      connector: 'Deeplink + postback',
      environment: 'sandbox',
      lifecycleStatus: 'active',
      notes: 'Sandbox-прогон пройден 2026-08-20, production ещё не активирован.',
      updatedAt: '2026-08-20T12:00:00Z',
    },
    {
      id: 'int-p4',
      partnerId: 'p-4',
      level: 'L0',
      connector: 'Ручное подтверждение в ЛК',
      environment: 'production',
      lifecycleStatus: 'active',
      notes: 'API отсутствует, используется ручной pipeline команд.',
      updatedAt: '2026-08-10T12:00:00Z',
    },
  )
}

const OFFER_TITLES_P1 = [
  'Страховка путешественника «Роуминг+»',
  'ОСАГО онлайн со скидкой',
  'Страхование багажа',
  'Каско для новых авто',
]
const OFFER_TITLES_P4 = ['Онлайн-консультация терапевта', 'Консультация педиатра 24/7', 'Второе мнение врача']

function seedOffers(db: Database, rnd: RandomFn, now: string): OfferVersion[] {
  const publishedVersions: OfferVersion[] = []
  let offerCounter = 1

  function addOffer(
    partnerId: string,
    title: string,
    lifecycleStatus: Offer['lifecycleStatus'],
    outletIds: string[],
  ) {
    const offerId = `off-${offerCounter++}`
    const revision = lifecycleStatus === 'published' || lifecycleStatus === 'paused' ? 1 : 1
    const versionId = `${offerId}-v${revision}`
    const couponPriceMinor = intBetween(rnd, 30000, 250000)

    db.offers.push({
      id: offerId,
      partnerId,
      title,
      currentLiveVersion: lifecycleStatus === 'published' || lifecycleStatus === 'paused' ? revision : null,
      lifecycleStatus,
      createdAt: daysAgoIso(rnd, 60, now),
      updatedAt: daysAgoIso(rnd, 5, now),
    })

    const version: OfferVersion = {
      id: versionId,
      offerId,
      partnerId,
      revision,
      mechanic: 'coupon',
      benefit: `Скидка ${intBetween(rnd, 10, 40)}% на услугу`,
      description: `Демонстрационное описание оффера «${title}».`,
      couponPrice: { amountMinor: couponPriceMinor, currency: 'RUB' },
      servicePrice: { amountMinor: couponPriceMinor * intBetween(rnd, 2, 4), currency: 'RUB' },
      region: 'РФ, все регионы',
      startDate: daysAgoIso(rnd, 45, now),
      endDate: new Date(new Date(now).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      usageRules: 'Один купон на клиента, не суммируется с другими промо.',
      refundRules: 'Возврат возможен до момента исполнения услуги.',
      supportContact: 'support@partner.demo',
      commissionModel: pick(rnd, ['CPA', 'CPS', 'RevShare'] as const),
      outletIds,
      iconDataUrl: null,
      moderationStatus: lifecycleStatus,
      moderationNotes:
        lifecycleStatus === 'changes_requested'
          ? [
              {
                id: `${versionId}-note-1`,
                field: 'usageRules',
                message: 'Уточните ограничения по одному клиенту — формулировка неоднозначна.',
                authorLabel: 'Елена Гурьева',
                createdAt: daysAgoIso(rnd, 4, now),
              },
            ]
          : [],
      createdAt: daysAgoIso(rnd, 50, now),
      submittedForReviewAt: lifecycleStatus === 'in_review' ? daysAgoIso(rnd, 3, now) : null,
    }
    db.offerVersions.push(version)

    if (lifecycleStatus === 'published' || lifecycleStatus === 'paused') {
      db.commissionPolicies.push({
        id: `${versionId}-policy`,
        offerVersionId: versionId,
        model: version.commissionModel,
        rate: version.commissionModel === 'CPA' ? null : 0.2,
        fixedFeeMinor: version.commissionModel === 'CPA' ? intBetween(rnd, 5000, 20000) : null,
        effectiveFrom: version.startDate,
      })

      const batchId = `${versionId}-batch`
      const totalCodes = intBetween(rnd, 30, 80)
      db.codeBatches.push({
        id: batchId,
        offerVersionId: versionId,
        partnerId,
        createdAt: version.startDate,
        totalCodes,
        expiresAt: version.endDate,
      })
      for (let i = 0; i < totalCodes; i++) {
        db.couponCodes.push({
          id: `${batchId}-c${i}`,
          batchId,
          code: `${offerId.toUpperCase()}-${(1000 + i).toString()}`,
          status: i < totalCodes * 0.6 ? 'redeemed' : i < totalCodes * 0.8 ? 'issued' : 'available',
          reservedOrderId: null,
        })
      }

      publishedVersions.push(version)
    }
  }

  addOffer('p-1', OFFER_TITLES_P1[0], 'published', ['out-1'])
  addOffer('p-1', OFFER_TITLES_P1[1], 'published', ['out-1'])
  addOffer('p-1', OFFER_TITLES_P1[2], 'paused', ['out-1'])
  addOffer('p-1', OFFER_TITLES_P1[3], 'in_review', ['out-1'])
  addOffer('p-1', 'Страховка от невыезда', 'draft', ['out-1'])
  addOffer('p-1', 'Расширенная гарантия на технику', 'changes_requested', ['out-1'])
  addOffer('p-4', OFFER_TITLES_P4[0], 'published', ['out-4a'])
  addOffer('p-4', OFFER_TITLES_P4[1], 'published', ['out-4a'])
  addOffer('p-4', OFFER_TITLES_P4[2], 'in_review', ['out-4a'])

  return publishedVersions
}

const CHANNELS = ['Приложение Билайн', 'Сайт Билайн', 'SMS-ссылка', 'Сайт партнёра']

function seedOrdersAndSettlements(db: Database, rnd: RandomFn, now: string, publishedVersions: OfferVersion[]) {
  if (publishedVersions.length === 0) return

  let orderCounter = 1
  const targetOutcomes: Array<{ actions: OrderAction[]; dispute?: OrderAction[] }> = [
    { actions: ['confirm', 'fulfil', 'close'] },
    { actions: ['confirm', 'fulfil', 'close'] },
    { actions: ['confirm', 'fulfil', 'close'] },
    { actions: ['confirm'] },
    { actions: ['confirm', 'fulfil'] },
    { actions: ['cancel'] },
    { actions: ['confirm', 'fulfil', 'close'] },
  ]

  const orders: Order[] = []

  for (let i = 0; i < 96; i++) {
    const version = pick(rnd, publishedVersions)
    const outcome = pick(rnd, targetOutcomes)
    const createdAt = daysAgoIso(rnd, 110, now)
    const isSandbox = rnd() < 0.12

    let order: Order = {
      id: `ord-${orderCounter}`,
      displayId: `MD-${(1000 + orderCounter).toString()}`,
      partnerId: version.partnerId,
      outletId: version.outletIds[0],
      offerId: version.offerId,
      offerVersionId: version.id,
      offerTitle: db.offers.find((o) => o.id === version.offerId)?.title ?? '',
      externalOrderId: null,
      sourceChannel: pick(rnd, CHANNELS),
      environment: isSandbox ? 'sandbox' : 'production',
      amount: version.couponPrice,
      lifecycleStatus: 'created',
      paymentStatus: isSandbox ? 'pending' : 'pending',
      disputeStatus: 'none',
      version: 1,
      createdAt,
    }
    orderCounter++

    for (const action of outcome.actions) {
      const result = applyOrderAction(order, action)
      const from = order.lifecycleStatus
      order = { ...order, ...result.patch, version: order.version + 1 }
      db.statusHistory.push({
        id: `${order.id}-h-${action}`,
        orderId: order.id,
        action,
        fromLifecycle: from,
        toLifecycle: order.lifecycleStatus,
        actorLabel: 'Анна Соколова',
        reason: action === 'cancel' ? 'Клиент отменил заказ' : null,
        occurredAt: createdAt,
      })
    }

    if (!isSandbox && (order.lifecycleStatus === 'fulfilled' || order.lifecycleStatus === 'closed')) {
      order = { ...order, paymentStatus: 'captured' }
      if (rnd() < 0.08) {
        const refundResult = applyOrderAction(order, 'request_refund')
        order = { ...order, ...refundResult.patch }
        if (rnd() < 0.5) {
          const succeedResult = applyOrderAction(order, 'refund_succeeded')
          order = { ...order, ...succeedResult.patch }
        }
      }
      if (rnd() < 0.05) {
        const disputeResult = applyOrderAction(order, 'open_dispute')
        order = { ...order, ...disputeResult.patch }
      }
    }

    orders.push(order)
  }

  db.orders.push(...orders)

  seedSettlements(db, orders)
}

function seedSettlements(db: Database, orders: Order[]) {
  const byPartnerAndMonth = new Map<string, Order[]>()
  for (const order of orders) {
    if (order.environment === 'sandbox') continue
    if (order.paymentStatus !== 'captured' && order.paymentStatus !== 'partially_refunded' && order.paymentStatus !== 'refunded')
      continue
    const month = order.createdAt.slice(0, 7)
    const key = `${order.partnerId}__${month}`
    const list = byPartnerAndMonth.get(key) ?? []
    list.push(order)
    byPartnerAndMonth.set(key, list)
  }

  let settlementCounter = 1
  for (const [key, list] of byPartnerAndMonth) {
    const [partnerId, month] = key.split('__')
    const settlementId = `stl-${settlementCounter++}`
    let gross = 0
    let fee = 0
    let hold = 0
    const lines = list.map((order, idx) => {
      const grossMinor = order.amount.amountMinor
      const feeMinor = Math.round(grossMinor * 0.2)
      const holdMinor = order.disputeStatus === 'open' ? grossMinor : 0
      const adjustmentMinor = order.paymentStatus === 'refunded' ? -grossMinor : 0
      const payableMinor = grossMinor - feeMinor - holdMinor + adjustmentMinor
      gross += grossMinor
      fee += feeMinor
      hold += holdMinor
      return {
        id: `${settlementId}-l${idx}`,
        settlementId,
        orderId: order.id,
        orderDisplayId: order.displayId,
        grossMinor,
        feeMinor,
        holdMinor,
        adjustmentMinor,
        payableMinor,
        note: order.disputeStatus === 'open' ? 'Удержано до разрешения спора' : null,
      }
    })
    const payable = lines.reduce((sum, l) => sum + l.payableMinor, 0)
    const isPastMonth = month < new Date().toISOString().slice(0, 7)

    db.settlements.push({
      id: settlementId,
      partnerId,
      periodFrom: `${month}-01T00:00:00Z`,
      periodTo: `${month}-28T23:59:59Z`,
      currency: 'RUB',
      status: isPastMonth ? 'paid' : 'reconciling',
      grossMinor: gross,
      feeMinor: fee,
      holdMinor: hold,
      payableMinor: payable,
      paidAt: isPastMonth ? `${month}-28T12:00:00Z` : null,
    })
    db.settlementLines.push(...lines)
  }
}

function seedSupportAndNotifications(db: Database, rnd: RandomFn, now: string) {
  db.supportCases.push(
    {
      id: 'case-1',
      partnerId: 'p-1',
      topic: 'Код не работает при погашении',
      relatedOrderId: db.orders[0]?.id ?? null,
      relatedOfferId: null,
      priority: 'high',
      ownerLabel: 'Дмитрий Носов',
      dueAt: daysAgoIso(rnd, -2, now),
      status: 'in_progress',
      createdAt: daysAgoIso(rnd, 1, now),
    },
    {
      id: 'case-2',
      partnerId: 'p-1',
      topic: 'Вопрос по расчётному периоду',
      relatedOrderId: null,
      relatedOfferId: null,
      priority: 'normal',
      ownerLabel: 'Дмитрий Носов',
      dueAt: daysAgoIso(rnd, -5, now),
      status: 'open',
      createdAt: daysAgoIso(rnd, 3, now),
    },
  )
  db.supportMessages.push({
    id: 'msg-1',
    caseId: 'case-1',
    authorLabel: 'Анна Соколова',
    authorSide: 'partner',
    text: 'Клиент сообщает, что код OF-1-1000 не принимается на кассе партнёра.',
    createdAt: daysAgoIso(rnd, 1, now),
  })

  db.notifications.push(
    {
      id: 'ntf-1',
      partnerId: 'p-1',
      severity: 'normal',
      title: 'Оффер «Расширенная гарантия на технику» требует правок',
      entityType: 'offer',
      entityId: 'off-6',
      readAt: null,
      createdAt: daysAgoIso(rnd, 4, now),
    },
    {
      id: 'ntf-2',
      partnerId: 'p-1',
      severity: 'critical',
      title: 'Открыт спор по заказу',
      entityType: 'order',
      entityId: db.orders.find((o) => o.disputeStatus === 'open')?.id ?? 'ord-1',
      readAt: null,
      createdAt: daysAgoIso(rnd, 2, now),
    },
  )

  db.events.push(
    {
      id: 'evt-1',
      type: 'partner.check.approved',
      occurredAt: '2026-06-06T09:00:00Z',
      actorId: 'u-kam',
      actorLabel: 'Дмитрий Носов',
      partnerId: 'p-1',
      entityType: 'partner',
      entityId: 'p-1',
      summary: 'Проверка партнёра пройдена, риск — низкий',
    },
    {
      id: 'evt-2',
      type: 'offer.published',
      occurredAt: daysAgoIso(rnd, 20, now),
      actorId: 'u-moderator',
      actorLabel: 'Елена Гурьева',
      partnerId: 'p-1',
      entityType: 'offer',
      entityId: 'off-1',
      summary: 'Оффер «Страховка путешественника «Роуминг+»» опубликован',
    },
  )
}

