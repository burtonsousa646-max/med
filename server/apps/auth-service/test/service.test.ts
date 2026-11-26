import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { status } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { AuthServiceClient } from '@platform/contracts/auth/v1/auth'
import { readAuthConfig } from '@platform/config'
import { firstValueFrom } from 'rxjs'
import { describe, it, expect, vi } from 'vitest'
import { EncryptedCodes } from '../src/infrastructure'
import { AUTH_DATABASE, type AuthDatabase, PrismaSessionStore } from '../src/infrastructure/prisma'
import { createAuthApp } from '../src/app.ts'

vi.mock('../src/infrastructure/prisma/email-delivery.ts', () => ({
  EmailDeliveryWorker: class {
    async runOne() {}
  },
}))

vi.mock('../src/infrastructure/grpc/notifications.ts', () => ({
  GrpcNotifications: class {
    send() {
      return Promise.reject(new Error('Транспорт отключён в тесте'))
    }
    onModuleDestroy() {}
  },
}))

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

describe('Вход и сессия через gRPC', () => {
  it('подтверждает адрес, проверяет и обновляет токены, отзывает сессию', async () => {
    const grpc = { host: '127.0.0.1', port: await availablePort() }
    const config = readAuthConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      AUTH_DATABASE_URL: process.env['TEST_AUTH_DATABASE_URL'],
      AUTH_CODE_KEY: randomBytes(32).toString('hex'),
      AUTH_NOTIFICATIONS_TLS_CA_FILE: 'test-ca',
      AUTH_NOTIFICATIONS_TLS_CERT_FILE: 'test-cert',
      AUTH_NOTIFICATIONS_TLS_KEY_FILE: 'test-key',
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
      const db = service.app.get<AuthDatabase>(AUTH_DATABASE)
      const userId = randomUUID()
      await db.authIdentity.create({
        data: { provider: 'email', subject: request.email, userId, registrationId: randomUUID() },
      })
      const challenge = await db.emailChallenge.findUniqueOrThrow({ where: request })
      const cipher = new EncryptedCodes(Buffer.from(config.codeKey, 'hex'))
      const code = cipher.open(request.email, challenge.sealedCode).toString('ascii')
      const verification = await firstValueFrom(auth.verifyEmailCode({ ...request, code }))
      const pair = verification.tokens!
      expect(pair.accessExpiresAt).toBeDefined()
      const validate = (accessToken: string) =>
        firstValueFrom(auth.validateSession({ accessToken, userActivity: true }))
      expect(await validate(pair.accessToken)).toEqual({ userId, verifiedEmail: request.email })
      await expect(
        firstValueFrom(auth.verifyEmailCode({ ...request, code })),
      ).rejects.toMatchObject({ code: status.UNAUTHENTICATED })
      const refresh = { refreshToken: pair.refreshToken }
      const fresh = await firstValueFrom(auth.refreshSession(refresh))
      expect(fresh.accessToken).not.toBe(pair.accessToken)
      await db.accessToken.updateMany({
        where: { session: { userId } },
        data: { expiresAt: new Date(0) },
      })
      await expect(validate(pair.accessToken)).rejects.toMatchObject({
        code: status.UNAUTHENTICATED,
        details: 'access_expired',
      })
      vi.spyOn(PrismaSessionStore.prototype, 'withAccess').mockRejectedValueOnce(
        new Error('Ошибка подключения к БД'),
      )
      await expect(validate(pair.accessToken)).rejects.toMatchObject({
        code: status.UNAVAILABLE,
        details: 'Сервис временно недоступен',
      })
      await firstValueFrom(auth.revokeSession(refresh))
      await expect(validate(fresh.accessToken)).rejects.toMatchObject({
        code: status.UNAUTHENTICATED,
        details: 'invalid_session',
      })
      await expect(firstValueFrom(auth.refreshSession(refresh))).rejects.toMatchObject({
        code: status.UNAUTHENTICATED,
      })
    } finally {
      client.close()
      await service.close()
    }
  })
})
