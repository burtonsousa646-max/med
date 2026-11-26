import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { RegisterProfile, RequestEmailCode, VerifyEmailCode } from '../src/application'
import type { PartnerProfiles } from '../src/application/ports'
import { EncryptedCodes } from '../src/infrastructure'
import {
  createDatabase,
  PrismaChallengeStore,
  PrismaRegistrationStore,
} from '../src/infrastructure/prisma'

const databaseUrl = process.env['TEST_AUTH_DATABASE_URL']
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Требуется отдельная TEST_AUTH_DATABASE_URL с суффиксом _test')
const db = createDatabase({ databaseUrl, databaseTimeoutMs: 3000 })
afterAll(() => db.$disconnect())

/** Общая база переживает пересоздание сценария. Код получает только тестовый получатель письма. */
function fixture(profiles: PartnerProfiles) {
  const email = randomUUID() + '@example.test'
  const cipher = new EncryptedCodes(randomBytes(32))
  const store = new PrismaChallengeStore(db)
  const registrations = new PrismaRegistrationStore(db)
  let time = Date.now()
  const clock = () => new Date(time)
  const request = new RequestEmailCode(store, cipher, clock)
  const register = () =>
    new RegisterProfile(new VerifyEmailCode(store, cipher, clock), profiles, registrations)
  async function nextCode() {
    time += 60_000
    expect(await request.execute(email)).toBe('ok')
    const row = await db.emailChallenge.findUniqueOrThrow({ where: { email } })
    return cipher.open(email, row.sealedCode).toString('ascii')
  }
  return { email, register, nextCode }
}

describe('Регистрация и привязка профиля', () => {
  it('после потери ответа восстанавливает профиль по сохранённому ключу без повторного погашения кода', async () => {
    const userId = randomUUID()
    const ensure = vi
      .fn<PartnerProfiles['ensure']>()
      .mockRejectedValueOnce(new Error('Ответ Partners потерян'))
      .mockResolvedValue(userId)
    const scenario = fixture({ ensure })
    const code = await scenario.nextCode()
    await expect(scenario.register().execute(scenario.email, code)).rejects.toThrow(
      'Ответ Partners потерян',
    )
    const where = { provider_subject: { provider: 'email', subject: scenario.email } }
    const pending = await db.authIdentity.findUniqueOrThrow({ where })
    expect(pending.userId).toBeNull()
    expect(await scenario.register().execute(scenario.email, code)).toEqual({
      outcome: 'invalid_code',
    })

    // В общей тестовой базе первым выбираем ожидающую запись именно этой фикстуры.
    await db.authIdentity.update({ where, data: { retryAt: new Date(0) } })
    await scenario.register().recoverOne()
    expect(ensure.mock.calls).toEqual([
      [pending.registrationId, scenario.email],
      [pending.registrationId, scenario.email],
    ])
    const result = await scenario
      .register()
      .execute(scenario.email.toUpperCase(), await scenario.nextCode())
    expect(result).toEqual({ outcome: 'ok', userId, verifiedEmail: scenario.email })
    expect(ensure).toHaveBeenCalledTimes(2)
  })

  it('два подтверждённых входа во время первого вызова Partners используют один ключ и один профиль', async () => {
    const started = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const profiles = new Map<string, string>()
    const ensure = vi.fn(async (registrationId: string) => {
      if (!profiles.has(registrationId)) profiles.set(registrationId, randomUUID())
      started.resolve(undefined)
      await release.promise
      return profiles.get(registrationId)!
    })
    const scenario = fixture({ ensure })
    const first = scenario.register().execute(scenario.email, await scenario.nextCode())
    try {
      await started.promise
      const second = scenario.register().execute(scenario.email, await scenario.nextCode())
      await vi.waitFor(() => {
        expect(ensure).toHaveBeenCalledTimes(2)
      })
      release.resolve(undefined)
      const [left, right] = await Promise.all([first, second])
      expect(left).toEqual(right)
      expect(left.outcome).toBe('ok')
      expect(profiles.size).toBe(1)
    } finally {
      release.resolve(undefined)
      await first
    }
  })
})
