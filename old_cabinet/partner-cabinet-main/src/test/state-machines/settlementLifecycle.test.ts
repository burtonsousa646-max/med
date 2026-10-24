import { describe, expect, it } from 'vitest'
import { settlementLifecycle } from '@/mock-api/state-machines/settlementLifecycle'
import { InvalidTransitionError } from '@/mock-api/types/common'

describe('settlementLifecycle', () => {
  it('happy path draft → paid', () => {
    expect(settlementLifecycle.nextState('draft', 'start_reconcile')).toBe('reconciling')
    expect(settlementLifecycle.nextState('reconciling', 'reconcile')).toBe('reconciled')
    expect(settlementLifecycle.nextState('reconciled', 'submit_for_approval')).toBe('awaiting_approval')
    expect(settlementLifecycle.nextState('awaiting_approval', 'approve')).toBe('approved')
    expect(settlementLifecycle.nextState('approved', 'initiate_payment')).toBe('payment_pending')
    expect(settlementLifecycle.nextState('payment_pending', 'mark_paid')).toBe('paid')
  })

  it('расхождения возвращают период в reconciling, а не пропускают проверку', () => {
    expect(settlementLifecycle.nextState('reconciling', 'find_discrepancy')).toBe('discrepancies')
    expect(settlementLifecycle.nextState('discrepancies', 'resolve_discrepancy')).toBe('reconciling')
    expect(() => settlementLifecycle.nextState('discrepancies', 'submit_for_approval')).toThrow(
      InvalidTransitionError,
    )
  })

  it('неуспешный платёж можно повторить, но paid — терминальное состояние', () => {
    expect(settlementLifecycle.nextState('payment_pending', 'mark_failed')).toBe('failed')
    expect(settlementLifecycle.nextState('failed', 'retry_payment')).toBe('payment_pending')
    expect(settlementLifecycle.allowedActions('paid')).toEqual([])
  })

  it('нельзя подтвердить оплату, минуя approval', () => {
    expect(() => settlementLifecycle.nextState('reconciled', 'initiate_payment')).toThrow(
      InvalidTransitionError,
    )
  })
})
