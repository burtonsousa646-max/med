import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { status } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { AuthServiceClient } from '@platform/contracts/auth/v1/auth'
import { readAuthConfig } from '@platform/config'
import { firstValueFrom } from 'rxjs'
import { describe, it, expect, vi } from 'vitest'
import { createAuthApp } from '../src/app.ts'

/** Выбирает свободный порт для настоящего клиента gRPC. */
async function availablePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    }),
  )
  return address.port
}

describe('Выпуск кода через gRPC', () => {
  it('принимает задание доставки и возвращает типизированный отказ при раннем повторе', async () => {
    const grpc = { host: '127.0.0.1', port: await availablePort() }
    const config = readAuthConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      AUTH_DATABASE_URL: process.env['TEST_AUTH_DATABASE_URL'],
      AUTH_CODE_KEY: randomBytes(32).toString('hex'),
    })
    const service = await createAuthApp({ ...config, http: { host: '127.0.0.1', port: 0 }, grpc })
    const client = new ClientGrpcProxy({
      url: grpc.host + ':' + String(grpc.port),
      package: 'platform.auth.v1',
      protoPath: protoPath('auth/v1/auth.proto'),
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    })
    try {
      await service.listen()
      const url = await service.app.getUrl()
      await vi.waitFor(async () => {
        expect((await fetch(url + '/health/ready')).status).toBe(200)
      })
      const auth = client.getService<AuthServiceClient>('AuthService')
      const request = { email: randomUUID() + '@example.test' }
      expect(await firstValueFrom(auth.requestEmailCode(request))).toEqual({})
      await expect(firstValueFrom(auth.requestEmailCode(request))).rejects.toMatchObject({
        code: status.RESOURCE_EXHAUSTED,
      })
      await expect(firstValueFrom(auth.requestEmailCode({ email: '' }))).rejects.toMatchObject({
        code: status.INVALID_ARGUMENT,
      })
    } finally {
      client.close()
      await service.close()
    }
  })
})
