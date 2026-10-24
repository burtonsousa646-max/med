import { describe, expect, it } from 'vitest'
import { integrationLifecycle } from '@/mock-api/state-machines/integrationLifecycle'
import { InvalidTransitionError } from '@/mock-api/types/common'

describe('integrationLifecycle', () => {
  it('happy path not_configured → active', () => {
    expect(integrationLifecycle.nextState('not_configured', 'configure')).toBe('configuring')
    expect(integrationLifecycle.nextState('configuring', 'start_test')).toBe('testing')
    expect(integrationLifecycle.nextState('testing', 'pass')).toBe('ready')
    expect(integrationLifecycle.nextState('ready', 'activate')).toBe('active')
  })

  it('провал теста возвращает в configuring, а не в active', () => {
    expect(integrationLifecycle.nextState('testing', 'fail')).toBe('failed')
    expect(integrationLifecycle.nextState('failed', 'retry_configure')).toBe('configuring')
    expect(() => integrationLifecycle.nextState('failed', 'activate')).toThrow(InvalidTransitionError)
  })

  it('active деградирует и восстанавливается', () => {
    expect(integrationLifecycle.nextState('active', 'degrade')).toBe('degraded')
    expect(integrationLifecycle.nextState('degraded', 'recover')).toBe('active')
  })

  it('revoke доступен из любого рабочего состояния', () => {
    expect(integrationLifecycle.nextState('active', 'revoke')).toBe('revoked')
    expect(integrationLifecycle.nextState('degraded', 'revoke')).toBe('revoked')
    expect(integrationLifecycle.nextState('paused', 'revoke')).toBe('revoked')
    expect(integrationLifecycle.allowedActions('revoked')).toEqual([])
  })
})
