import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { canonicalIp, ClientIdentityResolver } from './client-identity.ts'

/** Создаёт минимальный HTTP-запрос с заданным TCP peer и необязательным XFF. */
function createRequest(peerAddress: string, forwardedFor?: string): Request {
  return {
    socket: { remoteAddress: peerAddress },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  } as Request
}

describe('canonicalIp', () => {
  it('нормализует IPv4-mapped IPv6 и эквивалентные записи IPv6', () => {
    expect(canonicalIp('::ffff:192.0.2.1').address).toBe('192.0.2.1')
    expect(canonicalIp('2001:0db8:0000:0000:0000:0000:0000:0001').address).toBe(
      canonicalIp('2001:db8::1').address,
    )
  })
})

describe('адрес клиента через прокси', () => {
  it('игнорирует XFF, если TCP peer не входит в список доверенных прокси', async () => {
    const resolver = new ClientIdentityResolver([])

    const identity = await resolver.resolve(createRequest('192.0.2.1', '198.51.100.1'))

    expect(identity).toEqual({ canonicalIp: '192.0.2.1', verifiedUser: undefined })
  })

  it('берёт первый недоверенный адрес справа в цепочке доверенных прокси', async () => {
    const resolver = new ClientIdentityResolver(['10.0.0.0/8'])

    const identity = await resolver.resolve(
      createRequest('10.0.0.2', '198.51.100.99, 192.0.2.1, 10.0.0.3'),
    )

    expect(identity.canonicalIp).toBe('192.0.2.1')
  })

  it('отклоняет некорректный и слишком длинный XFF от доверенного прокси', async () => {
    const resolver = new ClientIdentityResolver(['10.0.0.0/8'])

    await expect(resolver.resolve(createRequest('10.0.0.2', 'not-ip'))).rejects.toThrow()
    await expect(resolver.resolve(createRequest('10.0.0.2', '1'.repeat(2049)))).rejects.toThrow()
  })
})

describe('подтверждённый пользователь', () => {
  it('читает пользователя только через внутренний порт идентификации', async () => {
    const users = {
      read: () => Promise.resolve({ realm: 'test', subject: 'synthetic-user' }),
    }
    const resolver = new ClientIdentityResolver([], users)

    const identity = await resolver.resolve(createRequest('192.0.2.1'))

    expect(identity.verifiedUser).toEqual({ realm: 'test', subject: 'synthetic-user' })
  })
})
