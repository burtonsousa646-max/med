import { describe, expect, it } from 'vitest'
import { buildSeedDatabase } from '@/mock-api/db/seed'

describe('buildSeedDatabase', () => {
  const NOW = '2026-09-30T12:00:00Z'
  const db = buildSeedDatabase(NOW)

  it('генерирует непустые коллекции по всем ключевым сущностям', () => {
    expect(db.partners.length).toBeGreaterThanOrEqual(6)
    expect(db.offers.length).toBeGreaterThan(0)
    expect(db.offerVersions.length).toBeGreaterThan(0)
    expect(db.orders.length).toBeGreaterThan(50)
    expect(db.settlements.length).toBeGreaterThan(0)
  })

  it('каждый заказ ссылается на существующую версию оффера того же партнёра', () => {
    const versionIds = new Set(db.offerVersions.map((v) => v.id))
    for (const order of db.orders) {
      expect(versionIds.has(order.offerVersionId)).toBe(true)
      const version = db.offerVersions.find((v) => v.id === order.offerVersionId)
      expect(version?.partnerId).toBe(order.partnerId)
    }
  })

  it('период расчёта равен сумме его строк (explainable totals)', () => {
    for (const settlement of db.settlements) {
      const lines = db.settlementLines.filter((l) => l.settlementId === settlement.id)
      const sum = lines.reduce((acc, l) => acc + l.payableMinor, 0)
      expect(sum).toBe(settlement.payableMinor)
    }
  })

  it('sandbox-заказы не попадают в расчёты', () => {
    const settledOrderIds = new Set(db.settlementLines.map((l) => l.orderId))
    const sandboxOrders = db.orders.filter((o) => o.environment === 'sandbox')
    for (const order of sandboxOrders) {
      expect(settledOrderIds.has(order.id)).toBe(false)
    }
  })

  it('детерминирован: одинаковый now даёт одинаковый снимок данных', () => {
    const db2 = buildSeedDatabase(NOW)
    expect(db2.orders.length).toBe(db.orders.length)
    expect(db2.orders[10]?.amount.amountMinor).toBe(db.orders[10]?.amount.amountMinor)
  })
})
