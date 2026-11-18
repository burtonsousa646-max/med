import { EventEmitter } from 'node:events'

import { Logger } from '@nestjs/common'
import type { Context, Unleash } from 'unleash-client'
import { describe, expect, it, vi } from 'vitest'

import { FeatureFlagsClient } from './feature-flags.client.js'

const FLAG = 'campaigns.launch.new-checkout'
const USER_ID = '0192f0a0-0000-7000-8000-000000000001'
const COMPANY_ID = '0192f0a0-0000-7000-8000-000000000002'

/** Подменённый SDK: включены только флаги из списка, контекст вызовов записывается. */
class FakeUnleash extends EventEmitter {
  readonly calls: { name: string; context: Context | undefined; fallback: boolean | undefined }[] =
    []
  readonly destroy = vi.fn()

  constructor(private readonly enabled: string[] = []) {
    super()
  }

  isEnabled(name: string, context?: Context, fallback?: boolean): boolean {
    this.calls.push({ name, context, fallback })
    return this.enabled.includes(name) || (fallback ?? false)
  }
}

function clientWith(fake: FakeUnleash): FeatureFlagsClient {
  return new FeatureFlagsClient(fake as unknown as Unleash)
}

describe('FeatureFlagsClient (К2)', () => {
  it('передаёт в Unleash userId и companyId', () => {
    const fake = new FakeUnleash([FLAG])
    const client = clientWith(fake)

    const enabled = client.isEnabled(FLAG, { userId: USER_ID, companyId: COMPANY_ID })

    expect(enabled).toBe(true)
    expect(fake.calls).toEqual([
      {
        name: FLAG,
        context: { userId: USER_ID, properties: { companyId: COMPANY_ID } },
        fallback: false,
      },
    ])
  })

  it('не передаёт в Unleash поля, которых нет в контексте', () => {
    const fake = new FakeUnleash([FLAG])
    const client = clientWith(fake)

    client.isEnabled(FLAG, { userId: USER_ID })
    client.isEnabled(FLAG, { companyId: COMPANY_ID })
    client.isEnabled(FLAG)

    expect(fake.calls.map((call) => call.context)).toEqual([
      { userId: USER_ID },
      { properties: { companyId: COMPANY_ID } },
      {},
    ])
  })

  it('не передаёт в Unleash ничего, кроме userId и companyId', () => {
    const fake = new FakeUnleash([FLAG])
    const client = clientWith(fake)
    const context = { userId: USER_ID, companyId: COMPANY_ID, phone: '+70000000000' }

    client.isEnabled(FLAG, context)

    expect(fake.calls[0]?.context).toEqual({
      userId: USER_ID,
      properties: { companyId: COMPANY_ID },
    })
  })

  it('возвращает false для неизвестного флага', () => {
    const fake = new FakeUnleash([FLAG])
    const client = clientWith(fake)

    const enabled = client.isEnabled('campaigns.launch.unknown')

    expect(enabled).toBe(false)
  })

  it('вызывает destroy у SDK при остановке модуля', () => {
    const fake = new FakeUnleash()
    const client = clientWith(fake)

    client.onModuleDestroy()

    expect(fake.destroy).toHaveBeenCalledOnce()
  })

  it('пишет ошибки и предупреждения SDK в лог на уровне warn с контекстом FeatureFlags', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const fake = new FakeUnleash()
    clientWith(fake)

    fake.emit('error', new Error('Unleash Repository error: connect ECONNREFUSED'))
    fake.emit('warn', 'http://127.0.0.1/client/features responded 404. Backing off')

    expect(warn.mock.calls).toEqual([
      ['Unleash Repository error: connect ECONNREFUSED'],
      ['http://127.0.0.1/client/features responded 404. Backing off'],
    ])
    expect(warn.mock.contexts.every((logger) => logger instanceof Logger)).toBe(true)
    expect(new Set(warn.mock.contexts.map((logger) => (logger as Logger)['context']))).toEqual(
      new Set(['FeatureFlags']),
    )
  })
})
