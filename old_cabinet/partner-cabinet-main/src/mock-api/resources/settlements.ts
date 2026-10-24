import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import { settlementLifecycle, type SettlementAction } from '../state-machines/settlementLifecycle'
import type { Discrepancy, Settlement, SettlementLine } from '../types'
import { logEvent, notify } from './events'

export async function listSettlements(partnerId: string): Promise<Settlement[]> {
  await networkLatency()
  return db.settlements
    .filter((s) => s.partnerId === partnerId)
    .sort((a, b) => b.periodFrom.localeCompare(a.periodFrom))
}

export async function listAllSettlements(): Promise<Array<Settlement & { partnerName: string }>> {
  await networkLatency()
  return db.settlements
    .map((s) => ({ ...s, partnerName: db.partners.find((p) => p.id === s.partnerId)?.legalName ?? s.partnerId }))
    .sort((a, b) => b.periodFrom.localeCompare(a.periodFrom))
}

export async function getSettlement(settlementId: string): Promise<Settlement | undefined> {
  await networkLatency()
  return db.settlements.find((s) => s.id === settlementId)
}

export async function getSettlementLines(settlementId: string): Promise<SettlementLine[]> {
  await networkLatency()
  return db.settlementLines.filter((l) => l.settlementId === settlementId)
}

export async function listDiscrepancies(settlementId: string): Promise<Discrepancy[]> {
  await networkLatency()
  return db.discrepancies.filter((d) => d.settlementId === settlementId)
}

export async function raiseDiscrepancy(input: {
  settlementId: string
  settlementLineId: string
  message: string
}): Promise<Discrepancy> {
  await networkLatency()
  const discrepancy: Discrepancy = {
    id: `disc-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    raisedAt: new Date().toISOString(),
    status: 'open',
  }
  db.discrepancies.push(discrepancy)

  const settlement = db.settlements.find((s) => s.id === input.settlementId)
  if (settlement && settlementLifecycle.canTransition(settlement.status, 'find_discrepancy')) {
    settlement.status = settlementLifecycle.nextState(settlement.status, 'find_discrepancy')
  }
  logEvent({
    type: 'settlement.discrepancy.raised',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: settlement?.partnerId,
    entityType: 'settlement',
    entityId: input.settlementId,
    summary: `Расхождение по строке ${input.settlementLineId}: ${input.message}`,
  })
  persist()
  return discrepancy
}

/** Плановый переход расчёта по guard-таблице (SOURCE: 08_STATE_MACHINES.md §Settlement). */
export async function advanceSettlement(
  settlementId: string,
  action: SettlementAction,
  actorLabel: string,
): Promise<Settlement> {
  await networkLatency()
  const settlement = db.settlements.find((s) => s.id === settlementId)
  if (!settlement) throw apiError('NOT_FOUND', 'Расчётный период не найден')

  settlement.status = settlementLifecycle.nextState(settlement.status, action)
  if (action === 'mark_paid') settlement.paidAt = new Date().toISOString()

  notify({
    partnerId: settlement.partnerId,
    severity: 'normal',
    title: `Статус расчёта изменён: ${settlement.status}`,
    entityType: 'settlement',
    entityId: settlement.id,
  })
  logEvent({
    type: `settlement.${action}`,
    actorId: 'system',
    actorLabel,
    partnerId: settlement.partnerId,
    entityType: 'settlement',
    entityId: settlement.id,
    summary: `Расчёт переведён в статус ${settlement.status}`,
  })
  persist()
  return settlement
}
