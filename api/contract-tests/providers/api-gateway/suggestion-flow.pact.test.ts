// Проверка HTTP-поставщика по OpenAPI. Это не frontend consumer Pact.
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import {
  readGatewayConfig,
  readSuggestionConfig,
  createSuggestionApp,
  createGateway,
  createAppRegistry,
  SuggestionGrpcClient,
  RedisRateLimiter,
  RateLimitedError,
  ClientIdentityResolver,
} from './dependencies'
import type { Gateway, SuggestionService } from './suggestion-flow.types.ts'

let service: SuggestionService | undefined
let gateway: Gateway | undefined
let limiter: RedisRateLimiter
let client: SuggestionGrpcClient
let baseUrl: string
let grpcCallCount = 0
let gatewayConfig: ReturnType<typeof readGatewayConfig>

const applicationNames = ['landing', 'cabinet', 'backoffice'] as const
const suggestionRoutes = [
  ['parties', 'пример'],
  ['addresses', 'пример'],
  ['banks', 'пример'],
  ['emails', 'example'],
] as const
const suggestionMethods = [
  'suggestParties',
  'suggestAddresses',
  'suggestBanks',
  'suggestEmails',
] as const
const jsonHeaders = { 'Content-Type': 'application/json' }

/** Выделяет свободный loopback-порт и закрывает временный listener. */
async function findAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Не удалось получить порт')

  const port = address.port
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => {
      if (error) rejectClose(error)
      else resolveClose()
    }),
  )

  return port
}

/** Создаёт конфигурацию сервиса с изолированным scope и локальными Redis. */
function createTestSuggestionConfig(grpcPort: number) {
  const scope = `flow-${randomUUID().slice(0, 8)}`

  return readSuggestionConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    SUGGESTION_PROVIDER: 'stub',
    SUGGESTION_SCOPE: scope,
    SUGGESTION_CACHE_REDIS_URL: process.env['TEST_CACHE_REDIS_URL'] ?? 'redis://127.0.0.1:6381',
    SUGGESTION_CACHE_HMAC_SECRET: 'synthetic-cache-secret-at-least-32-characters',
    SUGGESTION_REDIS_TIMEOUT_MS: '1000',
    SUGGESTION_GRPC_PORT: String(grpcPort),
  })
}

/** Подключает проверку общего лимита к операциям, помеченным в OpenAPI. */
function createRateLimitHook(rateLimiter: RedisRateLimiter) {
  const identities = new ClientIdentityResolver([])

  return async function beforeSuggestionRequest(
    request: Parameters<NonNullable<Parameters<typeof createGateway>[0]['beforeRequest']>>[0],
    response: Parameters<NonNullable<Parameters<typeof createGateway>[0]['beforeRequest']>>[1],
    operation: Parameters<NonNullable<Parameters<typeof createGateway>[0]['beforeRequest']>>[2],
    scope: Parameters<NonNullable<Parameters<typeof createGateway>[0]['beforeRequest']>>[3],
  ): Promise<void> {
    if (operation.operation['x-suggestion-rate-limit'] !== true) return

    try {
      await rateLimiter.assertAllowed(
        await identities.resolve(request),
        scope.requestId,
        scope.signal,
      )
    } catch (error) {
      if (error instanceof RateLimitedError) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds))
      }
      throw error
    }
  }
}

/** Создаёт Gateway с реальным rate limiter и счётчиком вызовов сервиса. */
async function createTestGateway(
  config: ReturnType<typeof readGatewayConfig>,
  rateLimiter: RedisRateLimiter,
  grpcClient: SuggestionGrpcClient,
): Promise<Gateway> {
  for (const method of suggestionMethods) {
    const original = grpcClient[method].bind(grpcClient)
    vi.spyOn(grpcClient, method).mockImplementation((query, scope) => {
      grpcCallCount++
      return original(query, scope)
    })
  }

  return createGateway({
    config,
    apps: createAppRegistry(
      pathToFileURL(resolve('../server/apps/api-gateway/dist/openapi') + '/'),
    ),
    testFlags: {},
    validateResponses: true,
    providers: [{ provide: SuggestionGrpcClient, useValue: grpcClient }],
    beforeRequest: createRateLimitHook(rateLimiter),
  })
}

/** Поднимает Suggestion, Redis-лимитер и основной Gateway для HTTP-сценариев. */
beforeAll(async () => {
  const grpcPort = await findAvailablePort()
  const suggestionConfig = createTestSuggestionConfig(grpcPort)

  service = await createSuggestionApp({
    ...suggestionConfig,
    http: { host: '127.0.0.1', port: 0 },
    grpc: { host: '127.0.0.1', port: grpcPort },
  })
  await service.listen()
  await service.cache.connection.connect()

  const rateRedisUrl = process.env['TEST_RATE_REDIS_URL'] ?? 'redis://127.0.0.1:6380'
  const config = readGatewayConfig(
    {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      UNLEASH_URL: 'http://127.0.0.1:1/api',
      UNLEASH_API_TOKEN: 'synthetic',
      SUGGESTION_SCOPE: `flow-${randomUUID().slice(0, 8)}`,
      SUGGESTION_GRPC_TARGET: `127.0.0.1:${grpcPort}`,
      SUGGESTION_RATE_REDIS_URL: rateRedisUrl,
      SUGGESTION_RATE_HMAC_SECRET: 'synthetic-rate-secret-at-least-32-characters',
      SUGGESTION_RATE_LIMIT_RPS: '1000',
      SUGGESTION_REDIS_TIMEOUT_MS: '1000',
    },
    { suggestions: true },
  )
  gatewayConfig = config

  limiter = new RedisRateLimiter(config.suggestions!)
  await limiter.connection.connect()
  client = new SuggestionGrpcClient(config.suggestions!.target, config.grpc.callTimeoutMs)
  gateway = await createTestGateway(config, limiter, client)

  await gateway.app.listen(0, '127.0.0.1')
  gateway.health.markReady()
  baseUrl = await gateway.app.getUrl()

  // Дожидаемся готовности HTTP и gRPC до запуска самих контрактных сценариев.
  await vi.waitFor(
    async () => {
      const response = await search('landing', 'parties', '')
      expect(response.status).toBe(200)
    },
    { timeout: 4000, interval: 25 },
  )
}, 15000)

/** Закрывает запущенные ресурсы после набора сценариев. */
afterAll(async () => {
  await gateway!.close()
  client!.close()
  limiter!.connection.close()
  await service!.close()
})

/** Выполняет публичный HTTP-запрос к Suggestions API выбранного приложения. */
function search(
  _application: string,
  kind: string,
  query: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/suggestions/${kind}`, {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      Cookie: 'session=synthetic-forged',
      'x-user-id': 'synthetic-forged',
    },
    body: JSON.stringify({ query, ...extra }),
  })
}

// Проверяет все операции из OpenAPI для публичного доступа каждого приложения.
it('R1–R4/R6.1–R6.5: четыре вида работают в общем API без сессии', async () => {
  for (const app of applicationNames) {
    for (const [kind, query] of suggestionRoutes) {
      const response = await search(app, kind, query)
      expect(response.status).toBe(200)
      const body: unknown = await response.json()
      expect(body).toHaveProperty('items')
      expect(JSON.stringify(body)).not.toContain('synthetic-forged')
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(
      await (
        await fetch(`${baseUrl}/api/v1/feature-flags/${app === 'cabinet' ? 'app' : app}`)
      ).json(),
    ).toEqual({})
  }
})

// HTTP-ответ сверяется после реального gRPC-вызова и сериализации обоих транспортов.
it('R1.2/R2.2: реальная gRPC-сериализация сохраняет отсутствие КПП и координат', async () => {
  expect(await (await search('cabinet', 'parties', 'ИП Пример')).json()).toEqual({
    items: [
      { value: 'ИП Пример Тест', inn: '000000000000', ogrn: '000000000000000', status: 'active' },
    ],
  })
  const address: unknown = await (await search('cabinet', 'addresses', 'пример')).json()
  expect(JSON.stringify(address)).not.toContain('coordinates')
  expect(JSON.stringify(address)).not.toContain('null')
})

// Вход валидируется OpenAPI до RPC; короткие значения возвращают пустой список.
it('R5: проверяет границы и запрещает фильтры/limit в настоящем OpenAPI', async () => {
  for (const query of ['', 'я', ' аб '])
    expect(await (await search('landing', 'parties', query)).json()).toEqual({ items: [] })
  expect((await search('landing', 'parties', ' ' + '😀'.repeat(150) + ' ')).status).toBe(200)
  const before = grpcCallCount
  expect((await search('landing', 'parties', '😀'.repeat(151))).status).toBe(400)
  expect((await search('landing', 'parties', 'пример', { limit: 20 })).status).toBe(400)
  expect((await search('landing', 'parties', 'x'.repeat(17000))).status).toBe(413)
  expect(grpcCallCount).toBe(before)
})

// Два независимых Gateway делят один Redis-лимит по IP для всех типов запросов.
it('R8.1–R8.8: общий HTTP-лимит 5 RPS действует между Gateway, приложениями и видами', async () => {
  const settings = {
    ...gatewayConfig.suggestions!,
    scope: `http-rate-${randomUUID().slice(0, 8)}`,
    rps: 5,
  }
  const limiters = [new RedisRateLimiter(settings), new RedisRateLimiter(settings)]
  const clients = [
    new SuggestionGrpcClient(settings.target, 3000),
    new SuggestionGrpcClient(settings.target, 3000),
  ]
  const gateways: Gateway[] = []
  let invoked = 0
  try {
    await Promise.all(limiters.map((rateLimiter) => rateLimiter.connection.connect()))
    await vi.waitFor(
      () =>
        limiters[0]!.assertAllowed(
          { canonicalIp: '192.0.2.254' },
          randomUUID(),
          new AbortController().signal,
        ),
      { timeout: 4000, interval: 25 },
    )
    for (let i = 0; i < 2; i++) {
      const transport = clients[i]!
      const rate = limiters[i]!
      for (const method of suggestionMethods) {
        const original = transport[method].bind(transport)
        vi.spyOn(transport, method).mockImplementation((query, scope) => {
          invoked++
          return original(query, scope)
        })
      }
      const item = await createGateway({
        config: { ...gatewayConfig, suggestions: settings },
        apps: createAppRegistry(
          pathToFileURL(resolve('../server/apps/api-gateway/dist/openapi') + '/'),
        ),
        testFlags: {},
        validateResponses: true,
        providers: [{ provide: SuggestionGrpcClient, useValue: transport }],
        beforeRequest: createRateLimitHook(rate),
      })
      await item.app.listen(0, '127.0.0.1')
      item.health.markReady()
      gateways.push(item)
    }
    const origins = await Promise.all(gateways.map((item) => item.app.getUrl()))
    const replies = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fetch(
          `${origins[i % 2]}/api/v1/suggestions/${['parties', 'addresses', 'banks', 'emails'][i % 4]}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': `192.0.2.${i + 1}`,
              Cookie: `session=forged-${i}`,
            },
            body: JSON.stringify({ query: i % 2 ? 'я' : '' }),
          },
        ),
      ),
    )
    expect(replies.filter((response) => response.status === 200)).toHaveLength(5)
    const denied = replies.filter((response) => response.status === 429)
    expect(denied).toHaveLength(1)
    expect(denied[0]?.headers.get('retry-after')).toBe('1')
    expect(invoked).toBe(5)
  } finally {
    for (const item of gateways) await item.close()
    for (const grpcClient of clients) grpcClient.close()
    for (const rateLimiter of limiters) rateLimiter.connection.close()
  }
}, 15000)

// Кеш необязателен: его недоступность не должна нарушать успешный HTTP-сценарий.
it('R9.5: отказ необязательного кеша не отключает поиск', async () => {
  service!.cache.connection.close()
  expect((await search('backoffice', 'emails', 'example')).status).toBe(200)
})

// Лимитер обязателен для защиты от перегрузки: при отказе RPC не вызывается.
it('R9.5: отказ ограничителя останавливает запрос до gRPC', async () => {
  limiter.connection.close()
  const before = grpcCallCount
  const response = await search('backoffice', 'emails', 'example')
  expect(response.status).toBe(503)
  expect(grpcCallCount).toBe(before)
  expect(await response.json()).toEqual({
    code: 'service_unavailable',
    message: 'Сервис временно недоступен',
  })
})
