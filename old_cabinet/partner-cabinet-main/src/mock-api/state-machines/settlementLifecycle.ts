import { createStateMachine } from './createStateMachine'
import type { SettlementStatus } from '../types/settlement'

export type SettlementAction =
  | 'start_reconcile'
  | 'find_discrepancy'
  | 'resolve_discrepancy'
  | 'reconcile'
  | 'submit_for_approval'
  | 'approve'
  | 'initiate_payment'
  | 'mark_paid'
  | 'mark_failed'
  | 'retry_payment'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Settlement
 * draft → reconciling → reconciled → awaiting_approval → approved → payment_pending → paid
 * reconciling → discrepancies → reconciling; payment_pending → failed → payment_pending
 */
export const settlementLifecycle = createStateMachine<SettlementStatus, SettlementAction>('Расчёт', {
  draft: { start_reconcile: 'reconciling' },
  reconciling: { find_discrepancy: 'discrepancies', reconcile: 'reconciled' },
  discrepancies: { resolve_discrepancy: 'reconciling' },
  reconciled: { submit_for_approval: 'awaiting_approval' },
  awaiting_approval: { approve: 'approved' },
  approved: { initiate_payment: 'payment_pending' },
  payment_pending: { mark_paid: 'paid', mark_failed: 'failed' },
  failed: { retry_payment: 'payment_pending' },
  paid: {},
})
