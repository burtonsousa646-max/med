import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { readGatewayConfig } from '@platform/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createGateway } from '../src/app'
import { createFeatureFlagsController } from '../src/feature-flags'
import { AppDefinition, OpenApiRegistry } from '../src/openapi'

let folder: string
let gateway: Awaited<ReturnType<typeof createGateway>> | undefined
let base: string
let apps: AppDefinition[]

/** Создаёт контроллер синтетического приложения для проверки HTTP-конвейера. */
function controller(id: string) {
  /** Возвращает тестовые данные для публичной и закрытой операций. */
  @Controller(`/api/${id}`)
  class TestController {
    /** Возвращает принятые параметры публичной операции. */
    @Post('/v1/items/:id')
    @HttpCode(200)
    item(@Param('id') id: string, @Body() body: { count: number }) {
      return { id, count: body.count }
    }

    /** Не должен вызываться без подтверждённой сессии. */
    @Get('/v1/private')
    privateOperation() {
      return { secret: 'never-reached' }
    }
  }
  return TestController
}

/** Записывает тестовый контракт и связывает его операции с контроллерами. */
async function definition(id: string): Promise<AppDefinition> {
  const resource = controller(id)
  const flags = createFeatureFlagsController(id)
  const documentFile = join(folder, `${id}.json`)
  const responses = {
    '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } },
    '401': {
      description: 'requires login',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['code', 'message'],
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
  }
  const doc = {
    openapi: '3.1.0',
    info: { title: id, version: '1' },
    servers: [{ url: `/api/${id}` }],
    security: [],
    paths: {
      '/v1/items/{id}': {
        post: {
          operationId: 'createItem',
          security: [],
          parameters: [
            { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
            { in: 'query', name: 'order', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { in: 'header', name: 'x-mode', schema: { type: 'string', enum: ['short', 'full'] } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['count'],
                  properties: { count: { type: 'integer' } },
                },
              },
            },
          },
          responses,
        },
      },
      '/v1/private': { get: { operationId: 'privateOperation', responses } },
      '/v1/feature-flags': { get: { operationId: 'getFeatureFlags', security: [], responses } },
    },
    components: {
      schemas: {
        FeatureFlags: {
          type: 'object',
          properties: id === 'gamma' ? {} : { [`${id}.flag`]: { type: 'boolean' } },
        },
      },
    },
  }
  await writeFile(documentFile, JSON.stringify(doc))
  return {
    id,
    documentFile,
    operations: [
      {
        operationId: 'createItem',
        method: 'POST',
        path: '/v1/items/{id}',
        controller: resource,
        handler: 'item',
      },
      {
        operationId: 'privateOperation',
        method: 'GET',
        path: '/v1/private',
        controller: resource,
        handler: 'privateOperation',
      },
      {
        operationId: 'getFeatureFlags',
        method: 'GET',
        path: '/v1/feature-flags',
        controller: flags,
        handler: 'getFeatureFlags',
      },
    ],
  }
}

// Приложения используют одинаковые пути, чтобы проверить выбор схемы по префиксу.
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'gateway-pipeline-'))
  apps = [await definition('alpha'), await definition('beta'), await definition('gamma')]
  const initial = readGatewayConfig({
    UNLEASH_URL: 'http://127.0.0.1:1/api',
    UNLEASH_API_TOKEN: 'synthetic',
    LOG_LEVEL: 'error',
    HTTP_BODY_LIMIT_BYTES: '128',
  })
  gateway = await createGateway({
    config: initial,
    apps,
    testFlags: { 'alpha.flag': true },
    validateResponses: true,
  })
  await gateway.app.listen(0, '127.0.0.1')
  gateway.health.markReady()
  base = await gateway.app.getUrl()
})

afterAll(async () => {
  await gateway?.close()
  if (folder) await rm(folder, { recursive: true, force: true })
})

const uuid = '00000000-0000-4000-8000-000000000001'

/** Отправляет тестовый запрос к операции с параметром пути. */
async function post(body: string, suffix = uuid, type = 'application/json') {
  return fetch(`${base}/api/alpha/v1/items/${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  })
}

describe('K3–K8: реальный HTTP-конвейер', () => {
  it('выдаёт health без сессии и отклоняет неизвестные query', async () => {
    const live = await fetch(`${base}/health/live`)
    expect(live.status).toBe(200)
    expect(live.headers.get('cache-control')).toBe('no-store')
    const invalid = await fetch(`${base}/health/ready?secret=x`)
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('no-store')
  })

  it('K2: не создаёт запись HTTP-запроса для healthcheck', async () => {
    const events = vi.spyOn(gateway!.logger, 'event')
    try {
      expect((await fetch(`${base}/health/live`)).status).toBe(200)
      expect((await fetch(`${base}/health/ready`)).status).toBe(200)
      expect(events.mock.calls.filter(([event]) => event === 'request')).toHaveLength(0)
    } finally {
      events.mockRestore()
    }
  })

  it('K2: журнал неизвестного маршрута не содержит исходный URL', async () => {
    const events = vi.spyOn(gateway!.logger, 'event')
    try {
      const response = await fetch(`${base}/unknown-synthetic-secret?token=synthetic-token`)
      expect(response.status).toBe(404)
      const record = events.mock.calls.find(([event]) => event === 'request')?.[1]
      expect(record).toMatchObject({ method: 'GET', status: 404 })
      expect(JSON.stringify(record)).not.toContain('synthetic')
      expect(record).not.toHaveProperty('route')
    } finally {
      events.mockRestore()
    }
  })

  it('проверяет тело по OpenAPI и создаёт свой request ID', async () => {
    const response = await post('{"count":2}')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: uuid, count: 2 })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/)
  })
  it.each(['{"count":"2"}', '{"count":2,"unknown":1}', '{', '{}'])(
    'не исправляет неверное JSON-тело %s',
    async (body) => {
      const response = await post(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        code: 'invalid_request',
        message: 'Некорректный запрос',
      })
    },
  )

  it('проверяет UUID, неизвестные query, размер и media type', async () => {
    expect((await post('{"count":2}', 'wrong')).status).toBe(400)
    expect((await post('{"count":2}', `${uuid}?companyId=forged`)).status).toBe(400)
    expect((await post(JSON.stringify({ count: 2, padding: 'x'.repeat(200) }))).status).toBe(413)
    expect((await post('{"count":2}', uuid, 'text/plain')).status).toBe(415)
  })

  it('K5: валидирует значения query и заголовков по контракту', async () => {
    const url = `${base}/api/alpha/v1/items/${uuid}`

    /** Отправляет запрос с выбранными значениями query и заголовка. */
    const request = (suffix: string, mode: string) =>
      fetch(`${url}${suffix}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mode': mode },
        body: '{"count":2}',
      })

    expect((await request('?order=asc', 'short')).status).toBe(200)
    expect((await request('?order=wrong', 'short')).status).toBe(400)
    expect((await request('?order=asc', 'wrong')).status).toBe(400)
  })

  it('security уровня документа не открывает закрытую операцию', async () => {
    const response = await fetch(`${base}/api/alpha/v1/private`, {
      headers: {
        Cookie: 'session=forged',
        Authorization: 'Bearer forged',
        'x-user-id': 'forged',
        'x-company-id': 'forged',
      },
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'unauthenticated', message: 'Требуется вход' })
  })

  it('различает приложения и не открывает HEAD/OPTIONS или неверный префикс', async () => {
    expect(await (await fetch(`${base}/api/alpha/v1/feature-flags`)).json()).toEqual({
      'alpha.flag': true,
    })
    expect(await (await fetch(`${base}/api/beta/v1/feature-flags`)).json()).toEqual({
      'beta.flag': false,
    })
    expect((await fetch(`${base}/api/alpha/v1/feature-flags`, { method: 'HEAD' })).status).toBe(404)
    expect((await fetch(`${base}/api/alpha/v1/feature-flags`, { method: 'OPTIONS' })).status).toBe(
      404,
    )
    expect((await fetch(`${base}/api/alpha-extra/v1/feature-flags`)).status).toBe(404)
  })

  it('K8: пустая схема флагов возвращает пустой объект без кеширования', async () => {
    const response = await fetch(`${base}/api/gamma/v1/feature-flags`)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({})
  })

  it('отклоняет конфликт и потерянный binding до запуска', () => {
    expect(() => new OpenApiRegistry([apps[0]!, apps[0]!])).toThrow()
    expect(() => new OpenApiRegistry([{ ...apps[0]!, operations: [] }])).toThrow()
  })

  it('снимает readiness и отклоняет новые операции при остановке', async () => {
    gateway!.health.beginShutdown()
    expect((await fetch(`${base}/health/ready`)).status).toBe(503)
    expect((await fetch(`${base}/health/live`)).status).toBe(200)
    expect((await post('{"count":2}')).status).toBe(503)
  })
})
