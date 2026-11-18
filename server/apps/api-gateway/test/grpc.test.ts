import {
  ClientOptions,
  credentials,
  loadPackageDefinition,
  makeGenericClientConstructor,
  Metadata,
  sendUnaryData,
  Server,
  ServerCredentials,
  ServerUnaryCall,
  ServiceDefinition,
  status,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GrpcCallExecutor, RequestScope } from '../src/grpc'
import type { Echo, EchoClient } from './grpc.types.ts'

let server: Server | undefined
let client: EchoClient | undefined
let count = 0
let received: Metadata
let onCancelled: (() => void) | undefined

// Локальный сервис позволяет наблюдать число вызовов и фактическую отмену транспорта.
beforeAll(async () => {
  const definition = loadSync(fileURLToPath(new URL('./fixtures/echo.proto', import.meta.url)))

  // Пакет загружается тем же gRPC runtime, что используется приложением.
  loadPackageDefinition(definition)
  const service = definition['fixture.Echo'] as ServiceDefinition
  server = new Server()
  server.addService(service, {
    echo(call: ServerUnaryCall<Echo, Echo>, callback: sendUnaryData<Echo>) {
      count++
      received = call.metadata
      if (call.request.value === 'unavailable') {
        callback({ code: status.UNAVAILABLE, message: 'synthetic-secret' })
        return
      }
      if (call.request.value === 'hang') {
        call.on('cancelled', () => onCancelled?.())
        return
      }
      callback(null, call.request)
    },
  })
  const port = await new Promise<number>((resolve, reject) => {
    server!.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, value) => {
      if (error) reject(error)
      else resolve(value)
    })
  })
  const Constructor = makeGenericClientConstructor(service, 'Echo') as unknown as new (
    address: string,
    channelCredentials: ReturnType<typeof credentials.createInsecure>,
    options: ClientOptions,
  ) => EchoClient
  client = new Constructor(`127.0.0.1:${port}`, credentials.createInsecure(), {
    'grpc.enable_retries': 0,
  })
})

afterAll(() => {
  client?.close()
  server?.forceShutdown()
})

/** Отправляет один unary RPC с заданным бюджетом. */
function call(value: string, timeout = 1000) {
  const scope = new RequestScope(timeout)
  return new GrpcCallExecutor(timeout).execute<Echo>(
    (metadata, deadline, callback) => client!.echo({ value }, metadata, { deadline }, callback),
    scope,
  )
}

describe('gRPC transport', () => {
  it('K9: реальный unary-вызов передаёт только серверную metadata', async () => {
    expect(await call('ok')).toEqual({ value: 'ok' })
    expect(received.get('x-request-id')).toHaveLength(1)
    expect(received.get('cookie')).toEqual([])
  })

  it('K9: UNAVAILABLE не вызывает повторов', async () => {
    const before = count
    await expect(call('unavailable')).rejects.toMatchObject({ code: status.UNAVAILABLE })
    expect(count - before).toBe(1)
  })

  it('K9: дедлайн отменяет реальный вызов', async () => {
    const before = count
    const cancelled = new Promise<void>((resolve) => {
      onCancelled = resolve
    })
    await expect(call('hang', 100)).rejects.toThrow()
    await cancelled
    expect(count - before).toBe(1)
  })
})
