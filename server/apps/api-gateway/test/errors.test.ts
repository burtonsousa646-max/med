import { Controller, Get, Param } from '@nestjs/common'
import { readGatewayConfig } from '@platform/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGateway } from '../src/app'
import { GatewayError } from '../src/errors.ts'

/** Создаёт контролируемые исключения на границе тестового приложения. */
@Controller('/api/errors')
class ErrorsController {
  /** Передаёт указанный тестом статус нормализатору ошибок. */
  @Get('/v1/status/:code')
  raise(@Param('code') code: string): never {
    throw new GatewayError(Number(code))
  }
}

let folder: string
let gateway: Awaited<ReturnType<typeof createGateway>> | undefined
let base: string

describe('K7: безопасные HTTP-ошибки', () => {
  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'gateway-errors-'))
    const documentFile = join(folder, 'errors.json')

    await writeFile(
      documentFile,
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'errors', version: '1' },
        servers: [{ url: '/api/errors' }],
        paths: {
          '/v1/status/{code}': {
            get: {
              operationId: 'raise',
              security: [],
              parameters: [
                { in: 'path', name: 'code', required: true, schema: { type: 'string' } },
              ],
              responses: { 200: { description: 'ok' } },
            },
          },
        },
      }),
    )

    const config = readGatewayConfig({
      UNLEASH_URL: 'http://127.0.0.1:1/api',
      UNLEASH_API_TOKEN: 'synthetic',
      LOG_LEVEL: 'error',
    })
    gateway = await createGateway({
      config,
      testFlags: {},
      apps: [
        {
          id: 'errors',
          documentFile,
          operations: [
            {
              operationId: 'raise',
              method: 'GET',
              path: '/v1/status/{code}',
              controller: ErrorsController,
              handler: 'raise',
            },
          ],
        },
      ],
    })
    await gateway.app.listen(0, '127.0.0.1')
    gateway.health.markReady()
    base = await gateway.app.getUrl()
  })

  afterAll(async () => {
    await gateway?.close()
    if (folder) await rm(folder, { recursive: true, force: true })
  })

  it.each([
    [400, 'invalid_request'],
    [401, 'unauthenticated'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [409, 'conflict'],
    [413, 'payload_too_large'],
    [415, 'unsupported_media_type'],
    [422, 'business_rule_violation'],
    [429, 'rate_limit_exceeded'],
    [500, 'internal_error'],
    [503, 'service_unavailable'],
  ])('возвращает статус %s в безопасном JSON', async (status, code) => {
    const response = await fetch(`${base}/api/errors/v1/status/${status}`)
    const body: unknown = await response.json()

    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toContain('application/json')
    if (!body || typeof body !== 'object') throw new Error('Ответ ошибки должен быть объектом')
    expect(body).toMatchObject({ code })
    expect(Object.keys(body).sort()).toEqual(['code', 'message'])
    expect(typeof Reflect.get(body, 'message')).toBe('string')
  })
})
