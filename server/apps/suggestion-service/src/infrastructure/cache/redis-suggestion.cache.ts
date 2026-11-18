// Кеш содержит только проверенную модель подсказок; строка запроса скрыта в HMAC ключа.
import { createHmac } from 'node:crypto'
import type { SuggestionConfig } from '@platform/config'

import type { SuggestionCache } from '../../application/ports'
import { type SuggestionQuery, record, sanitize, type Suggestion } from '../../domain/suggestion'

import { RedisConnection } from './redis-connection.ts'

const CACHE_VERSION = 1

/**
 * Redis-кеш проверенных моделей с версией envelope и фиксированным TTL.
 * Исходная строка поиска в ключе отсутствует; отказ кеша не блокирует сценарий поиска.
 */
export class RedisSuggestionCache implements SuggestionCache {
  readonly connection: RedisConnection

  /** Создаёт отдельное соединение кеша; конфигурация определяет пространство ключей и HMAC. */
  constructor(private readonly config: SuggestionConfig) {
    this.connection = new RedisConnection(config.cacheRedisUrl, config.redisTimeoutMs)
  }

  /**
   * Строит HMAC-ключ по источнику, виду и нормализованному вводу.
   * Scope, версия и режим провайдера разделяют несовместимые записи.
   */
  key(query: SuggestionQuery): string {
    const source = this.config.cloudUrl ?? 'stub:v1'
    const payload = JSON.stringify([source, query.kind, query.value])
    const digest = createHmac('sha256', this.config.cacheHmacSecret).update(payload).digest('hex')

    return `suggestion-cache:${this.config.scope}:v1:${this.config.provider}:${digest}`
  }

  /**
   * Читает без продления TTL. Нет записи — undefined; повреждённая запись удаляется.
   * Ошибки Redis, в том числе удаления, передаются сценарию для обхода кеша.
   */
  async get(
    key: string,
    signal: AbortSignal,
    query: SuggestionQuery,
  ): Promise<Suggestion[] | undefined> {
    const client = this.connection.current(signal)
    const encoded = await client.get(key)
    if (encoded === null) return undefined

    try {
      return decodeCachedSuggestions(encoded, query)
    } catch {
      // Повреждённая запись — промах. Ошибка удаления обрабатывается сценарием как сбой кеша.
      await client.del(key)
      return undefined
    }
  }

  /**
   * Сохраняет envelope версии 1 и TTL одним SET; пустой список — полноценная запись.
   */
  async set(key: string, items: Suggestion[], ttlSec: number, signal: AbortSignal): Promise<void> {
    const payload = JSON.stringify({ version: CACHE_VERSION, items })

    await this.connection.current(signal).set(key, payload, { EX: ttlSec })
  }
}

/**
 * Проверяет версию, поля envelope, лимит десяти вариантов и строгую модель каждого элемента.
 * Невалидная запись отклоняется целиком, чтобы кеш не возвращал частично повреждённые данные.
 */
function decodeCachedSuggestions(encoded: string, query: SuggestionQuery): Suggestion[] {
  const decoded: unknown = JSON.parse(encoded)
  const envelope = record(decoded)
  const items = envelope?.['items']

  if (
    envelope?.['version'] !== CACHE_VERSION ||
    !Array.isArray(items) ||
    items.length > 10 ||
    Object.keys(envelope).some((key) => !['version', 'items'].includes(key))
  ) {
    throw new Error('Некорректный кеш')
  }

  return items.map((item: unknown) => sanitize(query.kind, item, true))
}
