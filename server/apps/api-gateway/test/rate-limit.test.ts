import { GatewaySuggestionConfig, readGatewayConfig } from '@platform/config'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RateLimitedError, RedisRateLimiter } from '../src/rate-limit'
const connections: RedisRateLimiter[] = []
let settings: GatewaySuggestionConfig
let first: RedisRateLimiter
let second: RedisRateLimiter
const signal = () => new AbortController().signal
function take(limiter: RedisRateLimiter, ip: string, user?: string) {
  return limiter.assertAllowed(
    { canonicalIp: ip, verifiedUser: user ? { realm: 'test', subject: user } : undefined },
    randomUUID(),
    signal(),
  )
}
async function warm(limiter: RedisRateLimiter) {
  await vi.waitFor(
    async () => {
      await take(limiter, '192.0.2.254')
    },
    { timeout: 4000, interval: 25 },
  )
}
beforeAll(async () => {
  const config = readGatewayConfig(
    {
      NODE_ENV: 'test',
      UNLEASH_URL: 'http://127.0.0.1:1/api',
      UNLEASH_API_TOKEN: 'synthetic',
      SUGGESTION_GRPC_TARGET: '127.0.0.1:50051',
      SUGGESTION_RATE_REDIS_URL: process.env['TEST_RATE_REDIS_URL'] ?? 'redis://127.0.0.1:6380',
      SUGGESTION_RATE_HMAC_SECRET: 'synthetic-rate-secret-at-least-32-characters',
      SUGGESTION_SCOPE: `rate-${randomUUID().slice(0, 8)}`,
      SUGGESTION_REDIS_TIMEOUT_MS: '1000',
    },
    { suggestions: true },
  )
  settings = config.suggestions!
  first = new RedisRateLimiter(settings)
  second = new RedisRateLimiter(settings)
  connections.push(first, second)
  await Promise.all([first.connection.connect(), second.connection.connect()])
  await warm(first)
})
afterAll(() => {
  for (const connection of connections) connection.connection.close()
})
describe('RedisRateLimiter', () => {
  it('R8.1/R8.6: два экземпляра атомарно допускают не более 5 из 6 запросов', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => take(i % 2 ? first : second, '192.0.2.1')),
    )
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(5)
    const failure = results.find((x) => x.status === 'rejected')
    expect(failure?.status === 'rejected' && failure.reason instanceof RateLimitedError).toBe(true)
  })
  it('R8.8: подтверждённый пользователь имеет общий лимит с разных IP, отказ не расходует второй бюджет', async () => {
    for (let i = 0; i < 5; i++) await take(first, `198.51.100.${i + 1}`, 'same-user')
    await expect(take(second, '198.51.100.20', 'same-user')).rejects.toBeInstanceOf(
      RateLimitedError,
    )
    await expect(take(second, '198.51.100.20', 'other-user')).resolves.toBeUndefined()
  })
  it('R8.9: отказы не продлевают запрет и после окна доступ восстанавливается', async () => {
    for (let i = 0; i < 5; i++) await take(first, '192.0.2.30')
    await expect(take(first, '192.0.2.30')).rejects.toBeInstanceOf(RateLimitedError)
    await vi.waitFor(() => take(first, '192.0.2.30'), { timeout: 2500, interval: 20 })
  })
  it('R8.5: значение 2 RPS применяется конфигурацией без правки кода', async () => {
    const configured = new RedisRateLimiter({
      ...settings,
      scope: `two-${randomUUID().slice(0, 8)}`,
      rps: 2,
    })
    connections.push(configured)
    await configured.connection.connect()
    await warm(configured)
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => take(configured, '192.0.2.40')),
    )
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(2)
  })
  it('R9.5: потеря состояния создаёт общее защитное окно, другой RPS не сбрасывает gate', async () => {
    await first.connection.current().del(`suggestion-rate:${settings.scope}:gate`)
    await expect(take(first, '192.0.2.50')).rejects.toMatchObject({ status: 503 })
    await expect(take(second, '192.0.2.51')).rejects.toMatchObject({ status: 503 })
    await warm(first)
    const mismatch = new RedisRateLimiter({ ...settings, rps: 2 })
    connections.push(mismatch)
    await mismatch.connection.connect()
    await expect(take(mismatch, '192.0.2.52')).rejects.toMatchObject({ status: 503 })
  })
  it('R9.5: отказ соединения даёт 503, а не локальный безлимитный fallback', async () => {
    const unavailable = new RedisRateLimiter({ ...settings })
    await unavailable.connection.connect()
    unavailable.connection.close()
    await expect(take(unavailable, '192.0.2.60')).rejects.toMatchObject({ status: 503 })
  })
})
