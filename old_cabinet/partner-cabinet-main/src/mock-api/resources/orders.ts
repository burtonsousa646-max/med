import { db, persist } from '../db'
import { networkLatency, apiError, withIdempotency } from '../client'
import { allowedOrderActions, applyOrderAction } from '../state-machines/orderLifecycle'
import { VersionConflictError } from '../types/common'
import type { Order, OrderAction, StatusHistoryEntry } from '../types'
import { logEvent, notify } from './events'

export async function listOrders(partnerId: string): Promise<Order[]> {
  await networkLatency()
  return db.orders
    .filter((o) => o.partnerId === partnerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getOrder(orderId: string): Promise<Order | undefined> {
  await networkLatency()
  return db.orders.find((o) => o.id === orderId)
}

export async function getStatusHistory(orderId: string): Promise<StatusHistoryEntry[]> {
  await networkLatency()
  return db.statusHistory
    .filter((h) => h.orderId === orderId)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
}

export function getAllowedActions(order: Order): OrderAction[] {
  return allowedOrderActions(order)
}

export interface CreateSandboxOrderInput {
  partnerId: string
  outletId: string
  offerId: string
  offerVersionId: string
  offerTitle: string
  amountMinor: number
  sourceChannel: string
}

/** Тестовый заказ создаётся только в sandbox-окружении — не попадает в расчёты. */
export async function createSandboxOrder(input: CreateSandboxOrderInput, idempotencyKey?: string): Promise<Order> {
  await networkLatency()
  return withIdempotency(idempotencyKey, input, () => {
    const order: Order = {
      id: `ord-${crypto.randomUUID().slice(0, 8)}`,
      displayId: `MD-SB-${db.orders.length + 1000}`,
      partnerId: input.partnerId,
      outletId: input.outletId,
      offerId: input.offerId,
      offerVersionId: input.offerVersionId,
      offerTitle: input.offerTitle,
      externalOrderId: null,
      sourceChannel: input.sourceChannel,
      environment: 'sandbox',
      amount: { amountMinor: input.amountMinor, currency: 'RUB' },
      lifecycleStatus: 'created',
      paymentStatus: 'pending',
      disputeStatus: 'none',
      version: 1,
      createdAt: new Date().toISOString(),
    }
    db.orders.push(order)
    logEvent({
      type: 'order.sandbox.created',
      actorId: 'system',
      actorLabel: 'Sandbox',
      partnerId: input.partnerId,
      entityType: 'order',
      entityId: order.id,
      summary: `Тестовый заказ ${order.displayId} создан`,
    })
    persist()
    return order
  })
}

export interface TransitionOrderInput {
  orderId: string
  action: OrderAction
  reason: string | null
  actorLabel: string
  expectedVersion: number
}

/** Управляемый переход заказа: guard стейт-машины + оптимистическая версия + запись StatusHistory. */
export async function transitionOrder(input: TransitionOrderInput, idempotencyKey?: string): Promise<Order> {
  await networkLatency()
  return withIdempotency(idempotencyKey, input, () => {
    const order = db.orders.find((o) => o.id === input.orderId)
    if (!order) throw apiError('NOT_FOUND', 'Заказ не найден')
    if (order.version !== input.expectedVersion) throw new VersionConflictError('Заказ')

    const fromLifecycle = order.lifecycleStatus
    const { patch } = applyOrderAction(order, input.action)
    Object.assign(order, patch)
    order.version += 1

    const history: StatusHistoryEntry = {
      id: `${order.id}-h-${order.version}`,
      orderId: order.id,
      action: input.action,
      fromLifecycle,
      toLifecycle: order.lifecycleStatus,
      actorLabel: input.actorLabel,
      reason: input.reason,
      occurredAt: new Date().toISOString(),
    }
    db.statusHistory.push(history)

    if (input.action === 'open_dispute') {
      notify({
        partnerId: order.partnerId,
        severity: 'critical',
        title: `Открыт спор по заказу ${order.displayId}`,
        entityType: 'order',
        entityId: order.id,
      })
    }
    logEvent({
      type: `order.${input.action}`,
      actorId: 'system',
      actorLabel: input.actorLabel,
      partnerId: order.partnerId,
      entityType: 'order',
      entityId: order.id,
      summary: `${input.action}${input.reason ? ' — ' + input.reason : ''}`,
    })
    persist()
    return order
  })
}
