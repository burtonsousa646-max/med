import { db } from '../db'
import { networkLatency } from '../client'

export interface FunnelReport {
  periodDays: number
  totalOrders: number
  confirmed: number
  fulfilled: number
  cancelled: number
  refunded: number
  gmvMinor: number
  conversionConfirmed: number
  platformAvgConversion: number | null
  byChannel: Array<{ channel: string; orders: number; share: number }>
  byOffer: Array<{ offerId: string; offerTitle: string; orders: number; gmvMinor: number }>
}

/** Аналитика считается на лету из реальных заказов за период — период действительно
 *  меняет цифры (в отличие от статичного прототипа, см. MED_HANDOFF/11_UI_SCREEN_CATALOG.md). */
export async function getFunnel(partnerId: string, periodDays: 7 | 30 | 90): Promise<FunnelReport> {
  await networkLatency()
  const since = Date.now() - periodDays * 24 * 60 * 60 * 1000
  const orders = db.orders.filter(
    (o) => o.partnerId === partnerId && o.environment === 'production' && new Date(o.createdAt).getTime() >= since,
  )

  const confirmed = orders.filter((o) => o.lifecycleStatus !== 'created' && o.lifecycleStatus !== 'cancelled').length
  const fulfilled = orders.filter((o) => o.lifecycleStatus === 'fulfilled' || o.lifecycleStatus === 'closed').length
  const cancelled = orders.filter((o) => o.lifecycleStatus === 'cancelled').length
  const refunded = orders.filter((o) => o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded').length
  const gmvMinor = orders.reduce((sum, o) => sum + o.amount.amountMinor, 0)

  const channelCounts = new Map<string, number>()
  for (const o of orders) channelCounts.set(o.sourceChannel, (channelCounts.get(o.sourceChannel) ?? 0) + 1)
  const byChannel = [...channelCounts.entries()]
    .map(([channel, count]) => ({ channel, orders: count, share: orders.length ? count / orders.length : 0 }))
    .sort((a, b) => b.orders - a.orders)

  const offerCounts = new Map<string, { title: string; orders: number; gmvMinor: number }>()
  for (const o of orders) {
    const entry = offerCounts.get(o.offerId) ?? { title: o.offerTitle, orders: 0, gmvMinor: 0 }
    entry.orders += 1
    entry.gmvMinor += o.amount.amountMinor
    offerCounts.set(o.offerId, entry)
  }
  const byOffer = [...offerCounts.entries()]
    .map(([offerId, v]) => ({ offerId, offerTitle: v.title, orders: v.orders, gmvMinor: v.gmvMinor }))
    .sort((a, b) => b.gmvMinor - a.gmvMinor)

  return {
    periodDays,
    totalOrders: orders.length,
    confirmed,
    fulfilled,
    cancelled,
    refunded,
    gmvMinor,
    conversionConfirmed: orders.length ? confirmed / orders.length : 0,
    platformAvgConversion: computePlatformAvgConversion(since),
    byChannel,
    byOffer,
  }
}

/** Бенчмарк для сравнения: средняя конверсия по всем партнёрам платформы за тот же
 *  период (учитываются только партнёры минимум с 3 заказами, чтобы не шуметь). */
function computePlatformAvgConversion(sinceMs: number): number | null {
  const allOrders = db.orders.filter((o) => o.environment === 'production' && new Date(o.createdAt).getTime() >= sinceMs)
  const byPartner = new Map<string, { total: number; confirmed: number }>()
  for (const o of allOrders) {
    const entry = byPartner.get(o.partnerId) ?? { total: 0, confirmed: 0 }
    entry.total += 1
    if (o.lifecycleStatus !== 'created' && o.lifecycleStatus !== 'cancelled') entry.confirmed += 1
    byPartner.set(o.partnerId, entry)
  }
  const rates = [...byPartner.values()].filter((e) => e.total >= 3).map((e) => e.confirmed / e.total)
  if (rates.length === 0) return null
  return rates.reduce((sum, r) => sum + r, 0) / rates.length
}
