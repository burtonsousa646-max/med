import { GatewaySuggestionConfig } from '@platform/config'
import { createHash, createHmac } from 'node:crypto'
import { ClientIdentity } from '../client-identity'
import { GatewayError } from '../errors.ts'
import { RedisConnection } from './redis-connection.ts'
import { SLIDING_LOG } from './sliding-log.ts'

/** Представляет отказ по лимиту и срок ожидания следующего запроса. */
export class RateLimitedError extends GatewayError {
  /** Получает зависимости и настройки компонента. */
  constructor(readonly retryAfterSeconds: number) {
    super(429)
  }
}

/** Проверяет распределённый лимит запросов атомарной командой Redis. */
export class RedisRateLimiter {
  readonly connection: RedisConnection
  private readonly fingerprint: string

  /** Получает зависимости и настройки компонента. */
  constructor(
    private readonly config: GatewaySuggestionConfig,
    private readonly diagnostic: (result: string) => void = () => {},
  ) {
    this.connection = new RedisConnection(config.rateRedisUrl, config.redisTimeoutMs, () => {
      this.diagnostic('rate_redis_unavailable')
    })
    this.fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          'v1',
          config.rps,
          createHash('sha256').update(config.hmacSecret).digest('hex'),
        ]),
      )
      .digest('hex')
  }

  /** Скрывает идентификаторы в ключах Redis с помощью HMAC. */
  private hash(parts: string[]): string {
    return createHmac('sha256', this.config.hmacSecret).update(JSON.stringify(parts)).digest('hex')
  }

  /** Проверяет лимиты клиента и возвращает отказ при превышении или недоступности Redis. */
  async assertAllowed(
    identity: ClientIdentity,
    requestId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const prefix = `suggestion-rate:${this.config.scope}:`
    const keys = [`${prefix}gate`, `${prefix}ip:${this.hash(['ip', identity.canonicalIp])}`]
    if (identity.verifiedUser)
      keys.push(
        `${prefix}user:${this.hash(['user', identity.verifiedUser.realm, identity.verifiedUser.subject])}`,
      )
    let reply: unknown
    try {
      reply = await this.connection.current(signal).eval(SLIDING_LOG, {
        keys,
        arguments: [this.fingerprint, String(this.config.rps), requestId],
      })
    } catch {
      this.diagnostic('rate_unavailable')
      throw new GatewayError(503)
    }
    if (!Array.isArray(reply) || typeof reply[0] !== 'number' || typeof reply[1] !== 'number')
      throw new GatewayError(503)
    if (reply[0] === 1) return
    if (reply[0] === 0) {
      this.diagnostic('rate_limited')
      throw new RateLimitedError(Math.max(1, Math.ceil(reply[1] / 1000)))
    }
    this.diagnostic(reply[0] === -1 ? 'rate_warming_up' : 'rate_configuration_mismatch')
    throw new GatewayError(503)
  }
}
