import type { ISODateTime, MinorMoney, UUID } from './common'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Order: lifecycle vs payment vs dispute (три независимые оси) */
export type OrderLifecycleStatus = 'created' | 'confirmed' | 'fulfilled' | 'closed' | 'cancelled'
export type OrderPaymentStatus =
  | 'pending'
  | 'authorised'
  | 'captured'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'
  | 'voided'
export type OrderDisputeStatus = 'none' | 'open' | 'resolved'

export interface Order {
  id: UUID
  displayId: string
  partnerId: UUID
  outletId: UUID
  offerId: UUID
  offerVersionId: UUID
  offerTitle: string
  externalOrderId: string | null
  sourceChannel: string
  environment: 'sandbox' | 'production'
  amount: MinorMoney
  lifecycleStatus: OrderLifecycleStatus
  paymentStatus: OrderPaymentStatus
  disputeStatus: OrderDisputeStatus
  version: number
  createdAt: ISODateTime
}

export type OrderAction =
  | 'confirm'
  | 'fulfil'
  | 'cancel'
  | 'close'
  | 'request_refund'
  | 'refund_succeeded'
  | 'open_dispute'
  | 'resolve_dispute'

export interface StatusHistoryEntry {
  id: UUID
  orderId: UUID
  action: OrderAction
  fromLifecycle: OrderLifecycleStatus
  toLifecycle: OrderLifecycleStatus
  actorLabel: string
  reason: string | null
  occurredAt: ISODateTime
}
