import { db, persist } from '../db'
import { applyOrderAction } from '../state-machines/orderLifecycle'
import type { Order, OrderAction, OfferVersion, SettlementLine } from '../types'
import { logEvent, notify } from './events'

const CHANNELS = ['Приложение Билайн', 'Сайт Билайн', 'SMS-ссылка', 'Сайт партнёра']

const OUTCOMES: Array<{ actions: OrderAction[] }> = [
  { actions: ['confirm', 'fulfil', 'close'] },
  { actions: ['confirm', 'fulfil', 'close'] },
  { actions: ['confirm', 'fulfil', 'close'] },
  { actions: ['confirm'] },
  { actions: ['confirm', 'fulfil'] },
  { actions: ['cancel'] },
]

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function intBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomRecentIso(maxDaysAgo: number, notBeforeIso?: string): string {
  const now = Date.now()
  const lowerBound = notBeforeIso ? Math.max(new Date(notBeforeIso).getTime(), now - maxDaysAgo * 86_400_000) : now - maxDaysAgo * 86_400_000
  const span = Math.max(0, now - lowerBound)
  return new Date(lowerBound + Math.random() * span).toISOString()
}

/**
 * После публикации оффера партнёр должен сразу увидеть, как выглядит «живая» платформа —
 * без этого заказы/расчёты/аналитика остаются пустыми до первой реальной продажи, что для
 * демонстрации выглядит мертво. Генерирует правдоподобный поток тестовых заказов и
 * пересчитывает расчётные периоды той же логикой, что и seed (SOURCE: db/seed.ts).
 * Это явно демо-активность, не реальные продажи — помечается в событии и не путается
 * с sandbox-заказами (environment остаётся 'production', т.к. имитирует боевой трафик).
 */
export function generateDemoActivityForOffer(version: OfferVersion, offerTitle: string): void {
  const count = intBetween(8, 18)
  const touchedMonths = new Set<string>()
  const newOrders: Order[] = []

  for (let i = 0; i < count; i++) {
    const createdAt = randomRecentIso(21, version.startDate)
    const outcome = pick(OUTCOMES)

    let order: Order = {
      id: `ord-demo-${crypto.randomUUID().slice(0, 8)}`,
      displayId: `MD-${intBetween(5000, 9999)}`,
      partnerId: version.partnerId,
      outletId: version.outletIds[0] ?? '',
      offerId: version.offerId,
      offerVersionId: version.id,
      offerTitle,
      externalOrderId: null,
      sourceChannel: pick(CHANNELS),
      environment: 'production',
      amount: version.couponPrice,
      lifecycleStatus: 'created',
      paymentStatus: 'pending',
      disputeStatus: 'none',
      version: 1,
      createdAt,
    }

    for (const action of outcome.actions) {
      const from = order.lifecycleStatus
      const result = applyOrderAction(order, action)
      order = { ...order, ...result.patch, version: order.version + 1 }
      db.statusHistory.push({
        id: `${order.id}-h-${action}`,
        orderId: order.id,
        action,
        fromLifecycle: from,
        toLifecycle: order.lifecycleStatus,
        actorLabel: 'Клиент Билайна',
        reason: action === 'cancel' ? 'Клиент отменил заказ' : null,
        occurredAt: createdAt,
      })
    }

    if (order.lifecycleStatus === 'fulfilled' || order.lifecycleStatus === 'closed') {
      order = { ...order, paymentStatus: 'captured' }
      if (Math.random() < 0.08) {
        order = { ...order, ...applyOrderAction(order, 'request_refund').patch }
        if (Math.random() < 0.5) {
          order = { ...order, ...applyOrderAction(order, 'refund_succeeded').patch }
        }
      }
      if (Math.random() < 0.04) {
        order = { ...order, ...applyOrderAction(order, 'open_dispute').patch }
      }
    }

    newOrders.push(order)
    touchedMonths.add(order.createdAt.slice(0, 7))
  }

  db.orders.push(...newOrders)
  for (const month of touchedMonths) {
    recomputeSettlementForPartnerMonth(version.partnerId, month)
  }

  notify({
    partnerId: version.partnerId,
    severity: 'normal',
    title: `Появились первые заказы по офферу «${offerTitle}» (${count}) — загляните в «Заказы» и «Расчёты»`,
    entityType: 'offer',
    entityId: version.offerId,
  })
  logEvent({
    type: 'offer.demo_activity_generated',
    actorId: 'system',
    actorLabel: 'Платформа (демо)',
    partnerId: version.partnerId,
    entityType: 'offer',
    entityId: version.offerId,
    summary: `Сгенерировано ${count} демо-заказов для оффера «${offerTitle}» — чтобы показать живую аналитику и расчёты`,
  })
  persist()
}

/** Пересчитывает расчётный период партнёра за месяц из его текущих production-заказов —
 *  та же математика построчного расчёта, что и в db/seed.ts (демо-ставка 20%, удержание
 *  при открытом споре, сторно при полном возврате). Идемпотентно: полностью заменяет
 *  существующие строки периода, а не дублирует их при повторном вызове. */
function recomputeSettlementForPartnerMonth(partnerId: string, month: string): void {
  const monthOrders = db.orders.filter(
    (o) =>
      o.partnerId === partnerId &&
      o.environment === 'production' &&
      o.createdAt.slice(0, 7) === month &&
      (o.paymentStatus === 'captured' || o.paymentStatus === 'partially_refunded' || o.paymentStatus === 'refunded'),
  )
  if (monthOrders.length === 0) return

  let existing = db.settlements.find((s) => s.partnerId === partnerId && s.periodFrom.slice(0, 7) === month)
  const settlementId = existing?.id ?? `stl-${crypto.randomUUID().slice(0, 8)}`
  db.settlementLines = db.settlementLines.filter((l) => l.settlementId !== settlementId)

  let gross = 0
  let fee = 0
  let hold = 0
  const lines: SettlementLine[] = monthOrders.map((order, idx) => {
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
  db.settlementLines.push(...lines)
  const payable = lines.reduce((sum, l) => sum + l.payableMinor, 0)
  const isPastMonth = month < new Date().toISOString().slice(0, 7)

  if (existing) {
    existing.grossMinor = gross
    existing.feeMinor = fee
    existing.holdMinor = hold
    existing.payableMinor = payable
  } else {
    existing = {
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
    }
    db.settlements.push(existing)
  }
}
