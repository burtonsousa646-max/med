import { describe, expect, it } from 'vitest'
import { partnerLifecycle } from '@/mock-api/state-machines/partnerLifecycle'
import { InvalidTransitionError } from '@/mock-api/types/common'

describe('partnerLifecycle', () => {
  it('проводит партнёра по happy path draft → active', () => {
    expect(partnerLifecycle.nextState('draft', 'submit')).toBe('submitted')
    expect(partnerLifecycle.nextState('submitted', 'start_check')).toBe('checking')
    expect(partnerLifecycle.nextState('checking', 'approve')).toBe('approved')
    expect(partnerLifecycle.nextState('approved', 'activate')).toBe('active')
  })

  it('needs_info возвращает партнёра в submitted, а не сразу в checking', () => {
    expect(partnerLifecycle.nextState('checking', 'request_info')).toBe('needs_info')
    expect(partnerLifecycle.nextState('needs_info', 'resubmit')).toBe('submitted')
  })

  it('active и suspended переключаются друг в друга', () => {
    expect(partnerLifecycle.nextState('active', 'suspend')).toBe('suspended')
    expect(partnerLifecycle.nextState('suspended', 'reactivate')).toBe('active')
  })

  it('offboarding возможен и из active, и из suspended', () => {
    expect(partnerLifecycle.nextState('active', 'begin_offboarding')).toBe('terminating')
    expect(partnerLifecycle.nextState('suspended', 'begin_offboarding')).toBe('terminating')
    expect(partnerLifecycle.nextState('terminating', 'complete_offboarding')).toBe('terminated')
  })

  it('отклоняет недопустимые переходы', () => {
    expect(() => partnerLifecycle.nextState('draft', 'activate')).toThrow(InvalidTransitionError)
    expect(() => partnerLifecycle.nextState('rejected', 'submit')).toThrow(InvalidTransitionError)
    expect(() => partnerLifecycle.nextState('terminated', 'activate')).toThrow(InvalidTransitionError)
    expect(partnerLifecycle.canTransition('active', 'submit')).toBe(false)
  })
})
