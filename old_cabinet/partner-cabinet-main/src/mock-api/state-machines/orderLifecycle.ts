import { createStateMachine } from './createStateMachine'
import { InvalidTransitionError } from '../types/common'
import type {
  Order,
  OrderAction,
  OrderDisputeStatus,
  OrderLifecycleStatus,
  OrderPaymentStatus,
} from '../types/order'

/**
 * SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Order: lifecycle / payment / dispute — три
 * НЕЗАВИСИМЫЕ оси одного заказа. confirm/fulfil/cancel/close двигают lifecycle;
 * request_refund/refund_succeeded — payment; open_dispute/resolve_dispute — dispute.
 * "Подтверждён" не означает "оплачено" — оси не смешиваются в одном переходе.
 */

type LifecycleAction = 'confirm' | 'fulfil' | 'cancel' | 'close'
type PaymentAction = 'request_refund' | 'refund_succeeded'
type DisputeAction = 'open_dispute' | 'resolve_dispute'

const lifecycleMachine = createStateMachine<OrderLifecycleStatus, LifecycleAction>('Заказ (lifecycle)', {
  created: { confirm: 'confirmed', cancel: 'cancelled' },
  confirmed: { fulfil: 'fulfilled', cancel: 'cancelled' },
  fulfilled: { close: 'closed' },
  closed: {},
  cancelled: {},
})

// captured/partially_refunded — обе позволяют запросить (ещё) возврат;
// "refund pending" из RFC отображается тем же partially_refunded до подтверждения.
const paymentMachine = createStateMachine<OrderPaymentStatus, PaymentAction>('Заказ (payment)', {
  pending: {},
  authorised: {},
  captured: { request_refund: 'partially_refunded' },
  partially_refunded: { request_refund: 'partially_refunded', refund_succeeded: 'refunded' },
  refunded: {},
  failed: {},
  voided: {},
})

const disputeMachine = createStateMachine<OrderDisputeStatus, DisputeAction>('Заказ (dispute)', {
  none: { open_dispute: 'open' },
  open: { resolve_dispute: 'resolved' },
  resolved: {},
})

export interface OrderTransitionResult {
  patch: Partial<Pick<Order, 'lifecycleStatus' | 'paymentStatus' | 'disputeStatus'>>
}

/** Определяет, на какую ось действует команда, и применяет соответствующую стейт-машину.
 *  Бросает InvalidTransitionError, если действие недопустимо в текущем состоянии этой оси. */
export function applyOrderAction(order: Order, action: OrderAction): OrderTransitionResult {
  switch (action) {
    case 'confirm':
    case 'fulfil':
    case 'cancel':
    case 'close': {
      const next = lifecycleMachine.nextState(order.lifecycleStatus, action)
      return { patch: { lifecycleStatus: next } }
    }
    case 'request_refund':
    case 'refund_succeeded': {
      const next = paymentMachine.nextState(order.paymentStatus, action)
      return { patch: { paymentStatus: next } }
    }
    case 'open_dispute': {
      if (order.lifecycleStatus === 'cancelled') {
        throw new InvalidTransitionError('Заказ (dispute)', order.disputeStatus, action)
      }
      const next = disputeMachine.nextState(order.disputeStatus, action)
      return { patch: { disputeStatus: next } }
    }
    case 'resolve_dispute': {
      const next = disputeMachine.nextState(order.disputeStatus, action)
      return { patch: { disputeStatus: next } }
    }
    default: {
      const _exhaustive: never = action
      throw new Error(`Неизвестное действие: ${_exhaustive}`)
    }
  }
}

export function allowedOrderActions(order: Order): OrderAction[] {
  return [
    ...lifecycleMachine.allowedActions(order.lifecycleStatus),
    ...paymentMachine.allowedActions(order.paymentStatus),
    ...(order.lifecycleStatus === 'cancelled' ? [] : disputeMachine.allowedActions(order.disputeStatus)),
  ]
}
