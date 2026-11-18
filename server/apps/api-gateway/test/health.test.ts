import {
  Client,
  credentials,
  makeGenericClientConstructor,
  MethodDefinition,
  ServiceDefinition,
  ServiceError,
  status,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { readGatewayConfig } from '@platform/config'
import { PROTO_LOADER_OPTIONS, protoPath } from '@platform/contracts'
import { createServer } from 'node:net'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createGateway } from '../src/app'

let gateway: Awaited<ReturnType<typeof createGateway>>
let client: Client
let checkMethod: MethodDefinition<{ service: string }, { status: string }>
beforeAll(async () => {
  const socket = createServer()
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const address = socket.address()
  if (!address || typeof address === 'string') throw new Error('Нет адреса тестового порта')
  const port = address.port
  await new Promise<void>((resolve, reject) => {
    socket.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  const config = readGatewayConfig({
    UNLEASH_URL: 'http://127.0.0.1:1/api',
    UNLEASH_API_TOKEN: 'synthetic',
    GRPC_HEALTH_PORT: String(port),
    LOG_LEVEL: 'error',
  })
  gateway = await createGateway({ config, apps: [], testFlags: {} })
  await gateway.app.startAllMicroservices()
  const definition = loadSync(protoPath('grpc/health/v1/health.proto'), {
    ...PROTO_LOADER_OPTIONS,
    includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs],
  })
  const service = definition['grpc.health.v1.Health'] as ServiceDefinition
  checkMethod = service['Check'] as MethodDefinition<{ service: string }, { status: string }>
  const constructor = makeGenericClientConstructor(service, 'Health')
  client = new constructor(`127.0.0.1:${port}`, credentials.createInsecure())
})
afterAll(async () => {
  client.close()
  await gateway.close()
})
function check(service: string) {
  return new Promise<{ status: string }>((resolve, reject) => {
    client.makeUnaryRequest(
      '/grpc.health.v1.Health/Check',
      checkMethod.requestSerialize,
      checkMethod.responseDeserialize,
      { service },
      (error: ServiceError | null, response?: { status: string }) => {
        if (error) reject(error)
        else if (response) resolve(response)
        else reject(new Error('Нет ответа healthcheck'))
      },
    )
  })
}
it('K3: gRPC health отражает готовность и отклоняет неизвестный сервис', async () => {
  await expect(check('')).resolves.toEqual({ status: 'NOT_SERVING' })
  gateway.health.markReady()
  await expect(check('api-gateway')).resolves.toEqual({ status: 'SERVING' })
  await expect(check('other')).rejects.toMatchObject({ code: status.NOT_FOUND })
  gateway.health.beginShutdown()
  await expect(check('')).resolves.toEqual({ status: 'NOT_SERVING' })
})
it('K3: стандартный Watch возвращает UNIMPLEMENTED', async () => {
  const stream = client.makeServerStreamRequest(
    '/grpc.health.v1.Health/Watch',
    () => Buffer.alloc(0),
    (value) => value,
    {},
  )
  const error = await new Promise<ServiceError>((resolve) => stream.once('error', resolve))
  expect(error.code).toBe(status.UNIMPLEMENTED)
})
