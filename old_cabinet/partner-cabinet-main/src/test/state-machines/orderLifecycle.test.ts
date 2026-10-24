import { describe, expect, it } from 'vitest'
import { allowedOrderActions, applyOrderAction } from '@/mock-api/state-machines/orderLifecycle'
import { InvalidTransitionError } from '@/mock-api/types/common'
import type { Order } from '@/mock-api/types/order'

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    displayId: 'MD-0001',
    partnerId: 'p-1',
    outletId: 'out-1',
    offerId: 'of-1',
    offerVersionId: 'ofv-1',
    offerTitle: 'Тестовый оффер',
    externalOrderId: null,
    sourceChannel: 'Приложение Билайн',
    environment: 'sandbox',
    amount: { amountMinor: 100000, currency: 'RUB' },
    lifecycleStatus: 'created',
    paymentStatus: 'pending',
    disputeStatus: 'none',
    version: 1,
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('orderLifecycle — три независимые оси', () => {
  it('lifecycle: created → confirmed → fulfilled → closed', () => {
    expect(applyOrderAction(makeOrder({ lifecycleStatus: 'created' }), 'confirm').patch.lifecycleStatus).toBe(
      'confirmed',
    )
    expect(applyOrderAction(makeOrder({ lifecycleStatus: 'confirmed' }), 'fulfil').patch.lifecycleStatus).toBe(
      'fulfilled',
    )
    expect(applyOrderAction(makeOrder({ lifecycleStatus: 'fulfilled' }), 'close').patch.lifecycleStatus).toBe(
      'closed',
    )
  })

  it('cancel допустим только из created/confirmed', () => {
    expect(applyOrderAction(makeOrder({ lifecycleStatus: 'created' }), 'cancel').patch.lifecycleStatus).toBe(
      'cancelled',
    )
    expect(
      applyOrderAction(makeOrder({ lifecycleStatus: 'confirmed' }), 'cancel').patch.lifecycleStatus,
    ).toBe('cancelled')
    expect(() => applyOrderAction(makeOrder({ lifecycleStatus: 'fulfilled' }), 'cancel')).toThrow(
      InvalidTransitionError,
    )
  })

  it('fulfil на created (минуя confirm) запрещён — confirmed ≠ произвольный порядок', () => {
    expect(() => applyOrderAction(makeOrder({ lifecycleStatus: 'created' }), 'fulfil')).toThrow(
      InvalidTransitionError,
    )
  })

  it('close требует fulfilled — confirmed не равно paid/closed', () => {
    expect(() => applyOrderAction(makeOrder({ lifecycleStatus: 'confirmed' }), 'close')).toThrow(
      InvalidTransitionError,
    )
  })

  it('payment: captured → partially_refunded → refunded, независимо от lifecycle', () => {
    const afterRequest = applyOrderAction(
      makeOrder({ lifecycleStatus: 'fulfilled', paymentStatus: 'captured' }),
      'request_refund',
    )
    expect(afterRequest.patch.paymentStatus).toBe('partially_refunded')
    const afterSucceed = applyOrderAction(
      makeOrder({ lifecycleStatus: 'fulfilled', paymentStatus: 'partially_refunded' }),
      'refund_succeeded',
    )
    expect(afterSucceed.patch.paymentStatus).toBe('refunded')
  })

  it('нельзя запросить возврат по заказу без захваченного платежа', () => {
    expect(() =>
      applyOrderAction(makeOrder({ paymentStatus: 'pending' }), 'request_refund'),
    ).toThrow(InvalidTransitionError)
  })

  it('dispute: open_dispute запрещён для отменённого заказа, resolve_dispute требует open', () => {
    expect(() =>
      applyOrderAction(makeOrder({ lifecycleStatus: 'cancelled', disputeStatus: 'none' }), 'open_dispute'),
    ).toThrow(InvalidTransitionError)
    expect(
      applyOrderAction(makeOrder({ lifecycleStatus: 'fulfilled', disputeStatus: 'none' }), 'open_dispute')
        .patch.disputeStatus,
    ).toBe('open')
    expect(
      applyOrderAction(makeOrder({ disputeStatus: 'open' }), 'resolve_dispute').patch.disputeStatus,
    ).toBe('resolved')
    expect(() => applyOrderAction(makeOrder({ disputeStatus: 'none' }), 'resolve_dispute')).toThrow(
      InvalidTransitionError,
    )
  })

  it('confirmed ≠ paid: подтверждение заказа не меняет ось payment', () => {
    const order = makeOrder({ lifecycleStatus: 'created', paymentStatus: 'pending' })
    const result = applyOrderAction(order, 'confirm')
    expect(result.patch.paymentStatus).toBeUndefined()
  })

  it('allowedOrderActions не предлагает dispute-действия у отменённого заказа', () => {
    const actions = allowedOrderActions(makeOrder({ lifecycleStatus: 'cancelled', disputeStatus: 'none' }))
    expect(actions).not.toContain('open_dispute')
  })
})
