import { randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { status } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { PartnersServiceClient } from '@platform/contracts/partners/v1/partners'
import { readPartnersConfig } from '@platform/config'
import { firstValueFrom } from 'rxjs'
import { describe, it, expect, vi } from 'vitest'
import { PARTNERS_DATABASE, type PartnersDatabase } from '../src/infrastructure/prisma'
import { createPartnersApp } from '../src/app.ts'

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

describe('Профиль пользователя через gRPC', () => {
  it('выдерживает одновременную регистрацию, сохраняет контакты и различает ошибки контракта', async () => {
    const grpc = { host: '127.0.0.1', port: await availablePort() }
    const config = readPartnersConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      PARTNERS_DATABASE_URL: process.env['TEST_PARTNERS_DATABASE_URL'],
    })
    const service = await createPartnersApp({
      ...config,
      http: { host: '127.0.0.1', port: 0 },
      grpc,
    })
    const client = new ClientGrpcProxy({
      url: grpc.host + ':' + String(grpc.port),
      package: 'platform.partners.v1',
      protoPath: protoPath('partners/v1/partners.proto'),
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    })
    try {
      await service.listen()
      const url = await service.app.getUrl()
      await vi.waitFor(async () => {
        expect((await fetch(url + '/health/ready')).status).toBe(200)
      })
      const partners = client.getService<PartnersServiceClient>('PartnersService')
      const registrationId = randomUUID()
      const request = { registrationId, verifiedEmail: 'Person@Example.test' }
      const register = () => firstValueFrom(partners.ensureUserProfile(request))
      const registrations = await Promise.all(Array.from({ length: 6 }, register))
      const { userId } = registrations[0]!
      expect(new Set(registrations.map((result) => result.userId))).toEqual(new Set([userId]))
      const read = () => firstValueFrom(partners.getUserProfile({ userId }))
      const initial = await read()
      expect(initial.profile).toMatchObject({
        userId,
        contactEmail: 'person@example.test',
        canInvite: false,
      })
      expect(initial.profile?.organization ?? null).toBeNull()

      // Изменяем только контакт в фикстуре: повтор Auth сравнивает исходный адрес регистрации.
      const db = service.app.get<PartnersDatabase>(PARTNERS_DATABASE)
      await db.userProfile.update({
        where: { id: userId },
        data: { contactEmail: 'new@example.test' },
      })
      expect(await register()).toEqual({ userId })
      expect((await read()).profile?.contactEmail).toBe('new@example.test')
      await expect(
        firstValueFrom(
          partners.ensureUserProfile({ ...request, verifiedEmail: 'other@example.test' }),
        ),
      ).rejects.toMatchObject({ code: status.ABORTED })
      await expect(
        firstValueFrom(partners.ensureUserProfile({ ...request, registrationId: 'bad' })),
      ).rejects.toMatchObject({ code: status.INVALID_ARGUMENT })
      await expect(
        firstValueFrom(partners.getUserProfile({ userId: randomUUID() })),
      ).rejects.toMatchObject({ code: status.NOT_FOUND })
    } finally {
      client.close()
      await service.close()
    }
  })
})
