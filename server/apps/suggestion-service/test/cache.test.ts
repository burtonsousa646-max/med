import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { readSuggestionConfig, SuggestionConfig } from '@platform/config'
import { RedisSuggestionCache } from '../src/infrastructure/cache'
import { SuggestionQuery } from '../src/domain/suggestion'

// Redis поднимается отдельно тестовым окружением; scope изолирует ключи этого запуска.
let cache: RedisSuggestionCache
let config: SuggestionConfig

/** Запрос и сигнал используются в сценариях чтения и записи кеша. */
const query = new SuggestionQuery('email', 'qa@example.test')

/** Каждая операция получает свежий сигнал, чтобы не делить состояние отмены. */
const signal = () => new AbortController().signal

/** Читает настройки из тестового окружения и открывает реальное Redis-соединение. */
beforeAll(async () => {
  config = readSuggestionConfig({
    NODE_ENV: 'test',
    SUGGESTION_PROVIDER: 'stub',
    SUGGESTION_SCOPE: `cache-${randomUUID().slice(0, 8)}`,
    SUGGESTION_CACHE_REDIS_URL: process.env['TEST_CACHE_REDIS_URL'] ?? 'redis://127.0.0.1:6381',
    SUGGESTION_CACHE_HMAC_SECRET: 'synthetic-cache-secret-at-least-32-characters',
    SUGGESTION_REDIS_TIMEOUT_MS: '1000',
  })
  cache = new RedisSuggestionCache(config)
  await cache.connection.connect()
})

/** Закрывает соединение даже после неуспешной проверки, не оставляя сокет процесса. */
afterAll(() => {
  cache.connection.close()
})

// Проверяем хеширование ключа, форму envelope и отсутствие продления TTL при чтении.
it('R9.3/R9.6: хранит только модель, ключ скрывает ввод, TTL 24 часа не продлевается', async () => {
  const key = cache.key(query)
  expect(key).not.toContain(query.value)
  await cache.set(key, [{ value: 'qa@example.test' }], 86400, signal())
  expect(await cache.get(key, signal(), query)).toEqual([{ value: 'qa@example.test' }])
  const ttl = await cache.connection.current().pTTL(key)
  expect(ttl).toBeGreaterThan(86390000)
  await cache.get(key, signal(), query)
  expect(await cache.connection.current().pTTL(key)).toBeLessThanOrEqual(ttl)
  expect(JSON.parse((await cache.connection.current().get(key))!)).toEqual({
    version: 1,
    items: [{ value: 'qa@example.test' }],
  })
})

// Пустой массив должен отличаться от промаха, а запись истекает по Redis TTL.
it('R9.6: кеширует пустую выдачу и не использует просроченную', async () => {
  const search = new SuggestionQuery('party', 'без-совпадений')
  const key = cache.key(search)
  await cache.set(key, [], 1, signal())
  expect(await cache.get(key, signal(), search)).toEqual([])
  await vi.waitFor(
    async () => {
      expect(await cache.get(key, signal(), search)).toBeUndefined()
    },
    { timeout: 2500, interval: 25 },
  )
})

// Переключение режима или адреса облачного источника создаёт отдельное пространство кеша.
it('R7.2: режим и адрес источника разделяют кеш', () => {
  const alternate = new RedisSuggestionCache({ ...config, provider: 'dadata-onprem-stub' })
  expect(alternate.key(query)).not.toBe(cache.key(query))
  const cloud = new RedisSuggestionCache({
    ...config,
    provider: 'dadata-cloud',
    cloudUrl: 'https://example.test/suggest/',
  })
  expect(cloud.key(query)).not.toBe(cache.key(query))
  alternate.connection.close()
  cloud.connection.close()
})

// Повреждённые и неразрешённые поля удаляются, чтобы не повторять промах на каждом запросе.
it('R9.5: повреждённый ответ удаляется как промах', async () => {
  const key = cache.key(query)
  await cache.connection
    .current()
    .set(key, '{"version":1,"items":[{"value":"qa@example.test","secret":"synthetic"}]}')
  expect(await cache.get(key, signal(), query)).toBeUndefined()
  expect(await cache.connection.current().get(key)).toBeNull()
})
