import type { ISODateTime, UUID } from './common'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Settlement lifecycle */
export type SettlementStatus =
  | 'draft'
  | 'reconciling'
  | 'discrepancies'
  | 'reconciled'
  | 'awaiting_approval'
  | 'approved'
  | 'payment_pending'
  | 'failed'
  | 'paid'

export interface Settlement {
  id: UUID
  partnerId: UUID
  periodFrom: ISODateTime
  periodTo: ISODateTime
  currency: 'RUB'
  status: SettlementStatus
  grossMinor: number
  feeMinor: number
  holdMinor: number
  payableMinor: number
  paidAt: ISODateTime | null
}

export interface SettlementLine {
  id: UUID
  settlementId: UUID
  orderId: UUID
  orderDisplayId: string
  grossMinor: number
  feeMinor: number
  holdMinor: number
  adjustmentMinor: number
  payableMinor: number
  note: string | null
}

export interface Discrepancy {
  id: UUID
  settlementId: UUID
  settlementLineId: UUID
  message: string
  raisedAt: ISODateTime
  status: 'open' | 'resolved'
}

export interface SupportCase {
  id: UUID
  partnerId: UUID
  topic: string
  relatedOrderId: UUID | null
  relatedOfferId: UUID | null
  priority: 'low' | 'normal' | 'high'
  ownerLabel: string
  dueAt: ISODateTime
  status: 'open' | 'in_progress' | 'resolved'
  createdAt: ISODateTime
}

export interface SupportMessage {
  id: UUID
  caseId: UUID
  authorLabel: string
  authorSide: 'partner' | 'internal'
  text: string
  createdAt: ISODateTime
}

export interface Notification {
  id: UUID
  partnerId: UUID | null
  severity: 'critical' | 'normal'
  title: string
  entityType: string
  entityId: UUID
  readAt: ISODateTime | null
  createdAt: ISODateTime
}
