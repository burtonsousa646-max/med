import { Body, Controller, Inject, Post, Req } from '@nestjs/common'
import {
  credentials,
  makeGenericClientConstructor,
  Server,
  ServerCredentials,
  status,
  type ClientOptions,
  type ServerUnaryCall,
  type ServiceDefinition,
  type sendUnaryData,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { readGatewayConfig } from '@platform/config'
import type { Request } from 'express'
import { request } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createGateway } from '../src/app'
import { RequestContexts } from '../src/context.ts'
import { GrpcCallExecutor } from '../src/grpc'
import type { Echo, EchoClient } from './grpc.types.ts'

const ECHO_CLIENT = Symbol('ECHO_CLIENT')

/** Создаёт контроллер приложения с вызовом тестового gRPC-сервиса. */
function createEchoController(id: string) {
  /** Вызывает gRPC-сервис с бюджетом и отменой HTTP-запроса. */
  @Controller(`/api/${id}`)
  class EchoController {
    private readonly executor = new GrpcCallExecutor(5000)

    /** Получает клиент и контексты текущих запросов. */
    constructor(
      @Inject(ECHO_CLIENT) private readonly client: EchoClient,
      private readonly contexts: RequestContexts,
    ) {}

    /** Передаёт запрос в тестовый unary RPC. */
    @Post('/v1/call')
    async call(@Body() body: Echo, @Req() incoming: Request): Promise<Echo> {
      const scope = this.contexts.get(incoming)

      if (body.value === 'aggregate') {
        const pending = this.executor.execute<Echo>(
          (metadata, deadline, callback) =>
            this.client.echo({ value: 'hold' }, metadata, { deadline }, callback),
          scope,
        )
        const failing = this.executor.execute<Echo>(
          (metadata, deadline, callback) =>
            this.client.echo({ value: 'unavailable-after-hold' }, metadata, { deadline }, callback),
          scope,
        )
        const [result] = await Promise.all([pending, failing])
        return result
      }

      return this.executor.execute<Echo>(
        (metadata, deadline, callback) => this.client.echo(body, metadata, { deadline }, callback),
        scope,
      )
    }
  }

  return EchoController
}

let folder: string
let grpcServer: Server
let grpcClient: EchoClient
let gateway: Awaited<ReturnType<typeof createGateway>> | undefined
let base: string
let started: (() => void) | undefined
let cancelled: (() => void) | undefined
let holdReceived = false
let releaseFailure: (() => void) | undefined
let calls = 0

describe('K9: отмена gRPC при разрыве HTTP', () => {
  beforeAll(async () => {
    const definition = loadSync(fileURLToPath(new URL('./fixtures/echo.proto', import.meta.url)))
    const service = definition['fixture.Echo'] as ServiceDefinition
    grpcServer = new Server()
    grpcServer.addService(service, {
      echo(call: ServerUnaryCall<Echo, Echo>, callback: sendUnaryData<Echo>) {
        calls++
        if (call.request.value === 'hold') {
          call.on('cancelled', () => cancelled?.())
          holdReceived = true
          releaseFailure?.()
          started?.()
          return
        }

        if (call.request.value === 'unavailable-after-hold') {
          releaseFailure = () => {
            callback({ code: status.UNAVAILABLE, message: 'synthetic-secret' })
          }
          if (holdReceived) releaseFailure()
          return
        }

        if (call.request.value === 'unavailable') {
          callback({ code: status.UNAVAILABLE, message: 'synthetic-secret' })
          return
        }

        callback(null, call.request)
      },
    })

    const port = await new Promise<number>((resolve, reject) => {
      grpcServer.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, value) => {
        if (error) reject(error)
        else resolve(value)
      })
    })
    const Constructor = makeGenericClientConstructor(service, 'Echo') as unknown as new (
      address: string,
      channelCredentials: ReturnType<typeof credentials.createInsecure>,
      options: ClientOptions,
    ) => EchoClient
    grpcClient = new Constructor(`127.0.0.1:${port}`, credentials.createInsecure(), {
      'grpc.enable_retries': 0,
    })

    folder = await mkdtemp(join(tmpdir(), 'gateway-cancel-'))
    const apps = await Promise.all(
      ['echo', 'echo-two'].map(async (id) => {
        const documentFile = join(folder, `${id}.json`)
        const controller = createEchoController(id)

        await writeFile(
          documentFile,
          JSON.stringify({
            openapi: '3.1.0',
            info: { title: id, version: '1' },
            servers: [{ url: `/api/${id}` }],
            paths: {
              '/v1/call': {
                post: {
                  operationId: 'call',
                  security: [],
                  requestBody: {
                    required: true,
                    content: {
                      'application/json': {
                        schema: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['value'],
                          properties: { value: { type: 'string' } },
                        },
                      },
                    },
                  },
                  responses: { 201: { description: 'ok' }, 503: { description: 'unavailable' } },
                },
              },
            },
          }),
        )

        return {
          id,
          documentFile,
          operations: [
            { operationId: 'call', method: 'POST', path: '/v1/call', controller, handler: 'call' },
          ],
        }
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
      providers: [{ provide: ECHO_CLIENT, useValue: grpcClient }],
      apps,
    })
    await gateway.app.listen(0, '127.0.0.1')
    gateway.health.markReady()
    base = await gateway.app.getUrl()
  })

  afterAll(async () => {
    grpcClient.close()
    grpcServer.forceShutdown()
    await gateway?.close()
    if (folder) await rm(folder, { recursive: true, force: true })
  })

  it('нормальное чтение тела не отменяет RPC', async () => {
    const before = calls
    const events = vi.spyOn(gateway!.logger, 'event')

    try {
      const response = await fetch(`${base}/api/echo/v1/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'ok' }),
      })

      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({ value: 'ok' })
      expect(calls - before).toBe(1)
      const record = events.mock.calls.find(([event]) => event === 'request')?.[1]
      expect(record).toMatchObject({ appId: 'echo', operationId: 'call', status: 201 })
      expect(JSON.stringify(record)).not.toContain('"value"')
    } finally {
      events.mockRestore()
    }
  })

  it('ошибка зависимости возвращает безопасный 503 без повторного RPC', async () => {
    const before = calls
    const response = await fetch(`${base}/api/echo/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'unavailable' }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      code: 'service_unavailable',
      message: 'Сервис временно недоступен',
    })
    expect(calls - before).toBe(1)
  })

  it('K11: выбирает второе приложение и проверяет его тело до вызова RPC', async () => {
    const before = calls
    const invalid = await fetch(`${base}/api/echo-two/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 5 }),
    })

    expect(invalid.status).toBe(400)
    expect(calls - before).toBe(0)

    const valid = await fetch(`${base}/api/echo-two/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'ok' }),
    })

    expect(valid.status).toBe(201)
    expect(await valid.json()).toEqual({ value: 'ok' })
    expect(calls - before).toBe(1)
  })

  it('разрыв HTTP-соединения отменяет уже отправленный RPC', async () => {
    const before = calls
    const rpcStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const rpcCancelled = new Promise<void>((resolve) => {
      cancelled = resolve
    })
    const payload = JSON.stringify({ value: 'hold' })
    const outgoing = request(`${base}/api/echo/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    })

    // Сброс сокета намеренный; ошибка клиента не должна прерывать тест.
    outgoing.on('error', () => {})
    outgoing.end(payload)
    await rpcStarted
    outgoing.destroy()
    await rpcCancelled
    expect(calls - before).toBe(1)
  })

  it('ошибка обязательной части отменяет второй RPC и возвращает один ответ', async () => {
    holdReceived = false
    releaseFailure = undefined
    const before = calls
    const rpcCancelled = new Promise<void>((resolve) => {
      cancelled = resolve
    })

    const response = await fetch(`${base}/api/echo/v1/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'aggregate' }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      code: 'service_unavailable',
      message: 'Сервис временно недоступен',
    })
    await rpcCancelled
    expect(calls - before).toBe(2)
  })
})
