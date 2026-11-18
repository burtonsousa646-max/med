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
function controller(id: string) {
  @Controller(`/api/${id}`)
  class TestController {
    @Post('/v1/items/:id')
    @HttpCode(200)
    item(@Param('id') id: string, @Body() body: { count: number }) {
      return { id, count: body.count }
    }
    @Get('/v1/private')
    privateOperation() {
      return { secret: 'never-reached' }
    }
  }
  return TestController
}
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
        FeatureFlags: { type: 'object', properties: { [`${id}.flag`]: { type: 'boolean' } } },
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
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'gateway-pipeline-'))
  apps = [await definition('alpha'), await definition('beta')]
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
async function post(body: string, suffix = uuid, type = 'application/json') {
  return fetch(`${base}/api/alpha/v1/items/${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  })
}
describe('K3–K8: реальный HTTP-конвейер', () => {
  it('выдаёт health без сессии и отклоняет неизвестные query', async () => {
    expect((await fetch(`${base}/health/live`)).status).toBe(200)
    expect((await fetch(`${base}/health/ready?secret=x`)).status).toBe(400)
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
  it('security уровня документа не открывает закрытую операцию', async () => {
    const response = await fetch(`${base}/api/alpha/v1/private`, {
      headers: { Cookie: 'session=forged', 'x-user-id': 'forged' },
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
