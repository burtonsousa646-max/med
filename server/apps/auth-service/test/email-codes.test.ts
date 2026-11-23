import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { RequestEmailCode, VerifyEmailCode } from '../src/application'
import { EncryptedCodes } from '../src/infrastructure'
import { PrismaChallengeStore, createDatabase } from '../src/infrastructure/prisma'

const databaseUrl = process.env['TEST_AUTH_DATABASE_URL']
if (!databaseUrl) throw new Error('Для интеграционных тестов требуется TEST_AUTH_DATABASE_URL')
const database = createDatabase({ databaseUrl, databaseTimeoutMs: 3000 })
const protection = new EncryptedCodes(randomBytes(32))
afterAll(() => database.$disconnect())

/** Синтетический адрес и часы изолированы для каждого сценария. */
function fixture() {
  let timestamp = Date.UTC(2026, 0, 1)
  const email = randomUUID() + '@example.test'
  const store = new PrismaChallengeStore(database)
  const clock = () => new Date(timestamp)
  const request = new RequestEmailCode(store, protection, clock)
  const verify = new VerifyEmailCode(store, protection, clock)

  async function readChallenge() {
    const row = await database.emailChallenge.findUniqueOrThrow({
      where: { email },
      include: { deliveries: true },
    })
    return { ...row, code: protection.open(email, row.sealedCode).toString('ascii') }
  }
  return {
    email,
    request,
    verify,
    readChallenge,
    advance: (ms: number) => {
      timestamp += ms
    },
  }
}

describe('Проверки адреса в PostgreSQL', () => {
  it('сериализует первый выпуск, повторяет через минуту и сохраняет исходный срок', async () => {
    const scenario = fixture()
    const outcomes = await Promise.all([
      scenario.request.execute(scenario.email),
      scenario.request.execute(scenario.email.toUpperCase()),
    ])
    expect(outcomes.sort()).toEqual(['limited', 'ok'])
    const first = await scenario.readChallenge()
    scenario.advance(59_999)
    expect(await scenario.request.execute(scenario.email)).toBe('limited')
    scenario.advance(1)
    expect(await scenario.request.execute(scenario.email)).toBe('ok')
    const resent = await scenario.readChallenge()
    expect(resent.deliveries).toHaveLength(2)
    expect(resent.code).toBe(first.code)
    expect(resent.expiresAt).toEqual(first.expiresAt)
    scenario.advance(540_000)
    expect(await scenario.verify.execute(scenario.email, first.code)).toBe('invalid_code')
    expect(await scenario.request.execute(scenario.email)).toBe('ok')
    expect((await scenario.readChallenge()).id).not.toBe(first.id)
  })

  it.each([true, false])('пятая попытка, верное значение: %s', async (correct) => {
    const scenario = fixture()
    await scenario.request.execute(scenario.email)
    const { code } = await scenario.readChallenge()
    const wrong = code === '000000' ? '000001' : '000000'
    for (let attempt = 0; attempt < 4; attempt++)
      expect(await scenario.verify.execute(scenario.email, wrong)).toBe('invalid_code')
    scenario.advance(60_000)
    await scenario.request.execute(scenario.email)
    expect(
      await scenario.verify.execute(scenario.email.toUpperCase(), correct ? code : wrong),
    ).toBe(correct ? 'ok' : 'invalid_code')
    expect(await scenario.verify.execute(scenario.email, code)).toBe(
      correct ? 'invalid_code' : 'limited',
    )
  })

  it('только одно подтверждение погашает код, только его адрес может это сделать', async () => {
    const scenario = fixture()
    await scenario.request.execute(scenario.email)
    const { code } = await scenario.readChallenge()
    expect(await scenario.verify.execute('other@example.test', code)).toBe('invalid_code')
    const results = await Promise.all([
      scenario.verify.execute(scenario.email, code),
      scenario.verify.execute(scenario.email, code),
    ])
    expect(results.sort()).toEqual(['invalid_code', 'ok'])
  })
})
