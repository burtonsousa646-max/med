import { randomInt, randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { status } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import type { PartnersServiceClient } from '@platform/contracts/partners/v1/partners'
import { readPartnersConfig } from '@platform/config'
import { firstValueFrom } from 'rxjs'
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
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
  let service: Awaited<ReturnType<typeof createPartnersApp>>
  let client: ClientGrpcProxy
  let partners: PartnersServiceClient
  let db: PartnersDatabase
  beforeAll(async () => {
    const grpc = { host: '127.0.0.1', port: await availablePort() }
    const config = readPartnersConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      PARTNERS_DATABASE_URL: process.env['TEST_PARTNERS_DATABASE_URL'],
    })
    service = await createPartnersApp({
      ...config,
      http: { host: '127.0.0.1', port: 0 },
      grpc,
    })
    client = new ClientGrpcProxy({
      url: grpc.host + ':' + String(grpc.port),
      package: 'platform.partners.v1',
      protoPath: protoPath('partners/v1/partners.proto'),
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    })
    await service.listen()
    const url = await service.app.getUrl()
    await vi.waitFor(async () => {
      expect((await fetch(url + '/health/ready')).status).toBe(200)
    })
    partners = client.getService<PartnersServiceClient>('PartnersService')
    db = service.app.get<PartnersDatabase>(PARTNERS_DATABASE)
  })
  afterAll(async () => {
    client.close()
    await service.close()
  })

  it('выдерживает одновременную регистрацию, сохраняет контакты и различает ошибки контракта', async () => {
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
  })

  async function newUser() {
    const registrationId = randomUUID()
    const result = await firstValueFrom(
      partners.ensureUserProfile({
        registrationId,
        verifiedEmail: registrationId + '@example.test',
      }),
    )
    return result.userId
  }

  function resolve(userId: string, inn: string, customerName?: string) {
    return firstValueFrom(partners.resolveCampaignOrganization({ userId, inn, customerName }))
  }

  function representative(userId: string, organizationId: string) {
    return firstValueFrom(partners.getRepresentative({ userId, organizationId }))
  }

  function freeInn() {
    return String(randomInt(1_000_000_000, 10_000_000_000))
  }

  it('назначает одного первого представителя при конкуренции за ИНН', async () => {
    const users = await Promise.all([newUser(), newUser()])
    const inn = freeInn()
    const results = await Promise.allSettled(
      users.map((userId) => resolve(userId, inn, 'Название')),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const winner = results.findIndex((result) => result.status === 'fulfilled')
    const other = users[1 - winner]!
    expect(results[1 - winner]).toMatchObject({
      status: 'rejected',
      reason: { code: status.ALREADY_EXISTS, details: 'invitation_required' },
    })
    const owner = users[winner]!
    const { organization } = await resolve(owner, inn)
    expect(organization).toMatchObject({ inn, customerName: 'Название' })
    const id = organization!.organizationId
    expect((await representative(owner, id)).profile).toMatchObject({
      userId: owner,
      organization,
      canInvite: true,
    })
    expect(
      (await firstValueFrom(partners.getUserProfile({ userId: owner }))).profile?.organization,
    ).toEqual(organization)
    await expect(representative(other, id)).rejects.toMatchObject({ code: status.NOT_FOUND })

    // Действующее членство коллеги не даёт полномочия приглашать.
    await db.userProfile.update({ where: { id: other }, data: { organizationId: id } })
    expect((await representative(other, id)).profile).toMatchObject({
      userId: other,
      canInvite: false,
    })
    await db.userProfile.update({ where: { id: owner }, data: { organizationId: null } })
    await expect(representative(owner, id)).rejects.toMatchObject({ code: status.NOT_FOUND })
    expect(
      (await firstValueFrom(partners.getUserProfile({ userId: owner }))).profile?.canInvite,
    ).toBe(false)
    await expect(resolve(owner, inn)).rejects.toMatchObject({ code: status.ALREADY_EXISTS })
  })

  it('для одного профиля выбирает одну организацию при двух разных ИНН и повторном оформлении', async () => {
    const user = await newUser()
    const inns = [freeInn(), '00' + freeInn()]
    const results = await Promise.all(inns.map((inn) => resolve(user, inn)))
    expect(results[0]).toEqual(results[1])
    expect(await db.organization.count({ where: { inn: { in: inns } } })).toBe(1)
    expect(await resolve(user, '', 'Другое название')).toEqual(results[0])
  })

  it('проверяет формат свободного ИНН и не раскрывает чужие профили', async () => {
    const user = await newUser()
    const inn = '00' + freeInn()
    await expect(resolve(user, inn + '1')).rejects.toMatchObject({ code: status.INVALID_ARGUMENT })
    await expect(resolve(randomUUID(), inn)).rejects.toMatchObject({ code: status.NOT_FOUND })
    expect((await resolve(user, inn)).organization?.inn).toBe(inn)
    await expect(representative(user, randomUUID())).rejects.toMatchObject({
      code: status.NOT_FOUND,
    })
    await expect(representative(user, '')).rejects.toMatchObject({ code: status.INVALID_ARGUMENT })
  })
})
