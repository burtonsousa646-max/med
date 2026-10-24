import { describe, expect, it } from 'vitest'
import { offerLifecycle } from '@/mock-api/state-machines/offerLifecycle'
import { InvalidTransitionError } from '@/mock-api/types/common'

describe('offerLifecycle', () => {
  it('проводит оффер по happy path draft → published', () => {
    expect(offerLifecycle.nextState('draft', 'submit_for_review')).toBe('in_review')
    expect(offerLifecycle.nextState('in_review', 'approve')).toBe('approved')
    expect(offerLifecycle.nextState('approved', 'schedule')).toBe('scheduled')
    expect(offerLifecycle.nextState('scheduled', 'publish')).toBe('published')
  })

  it('changes_requested возвращает оффер в draft, а не публикует его', () => {
    expect(offerLifecycle.nextState('in_review', 'request_changes')).toBe('changes_requested')
    expect(offerLifecycle.nextState('changes_requested', 'revise')).toBe('draft')
    expect(() => offerLifecycle.nextState('changes_requested', 'publish')).toThrow(InvalidTransitionError)
  })

  it('published можно поставить на паузу и вернуть обратно', () => {
    expect(offerLifecycle.nextState('published', 'pause')).toBe('paused')
    expect(offerLifecycle.nextState('paused', 'resume')).toBe('published')
  })

  it('нельзя опубликовать неутверждённую версию', () => {
    expect(() => offerLifecycle.nextState('draft', 'publish')).toThrow(InvalidTransitionError)
    expect(() => offerLifecycle.nextState('in_review', 'publish')).toThrow(InvalidTransitionError)
    expect(() => offerLifecycle.nextState('changes_requested', 'publish')).toThrow(InvalidTransitionError)
  })

  it('archived и rejected — терминальные состояния', () => {
    expect(offerLifecycle.allowedActions('archived')).toEqual([])
    expect(offerLifecycle.allowedActions('rejected')).toEqual([])
  })
})
