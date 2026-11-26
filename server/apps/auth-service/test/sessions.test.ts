import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { Sessions } from '../src/application'
import { createDatabase, PrismaSessionStore } from '../src/infrastructure/prisma'

const databaseUrl = process.env['TEST_AUTH_DATABASE_URL']
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error('Требуется отдельная TEST_AUTH_DATABASE_URL с суффиксом _test')
const db = createDatabase({ databaseUrl, databaseTimeoutMs: 3000 })
afterAll(() => db.$disconnect())

function fixture() {
  const identity = { userId: randomUUID(), verifiedEmail: randomUUID() + '@example.test' }
  let time = Date.UTC(2026, 0, 1)
  const sessions = new Sessions(new PrismaSessionStore(db), () => new Date(time))
  return {
    identity,
    sessions,
    advance: (ms: number) => {
      time += ms
    },
  }
}

describe('Сессии в PostgreSQL', () => {
  it('различает границы 15 минут и 24 часов, фоновая проверка и refresh не продлевают сессию', async () => {
    const { sessions, identity, advance } = fixture()
    const pair = await sessions.open(identity)
    advance(15 * 60_000 - 1)
    expect(await sessions.validate(pair.accessToken, false)).toEqual(identity)
    advance(1)
    await expect(sessions.validate(pair.accessToken, true)).rejects.toThrow('access_expired')
    advance((24 * 60 - 15) * 60_000 - 1)
    const fresh = await sessions.refresh(pair.refreshToken)
    expect(await sessions.validate(fresh.accessToken, false)).toEqual(identity)
    advance(1)
    for (const token of [pair.accessToken, fresh.accessToken])
      await expect(sessions.validate(token, true)).rejects.toThrow('invalid_session')
    await expect(sessions.refresh(pair.refreshToken)).rejects.toThrow('invalid_session')
  })

  it('успешное пользовательское действие начинает новый период бездействия', async () => {
    const { sessions, identity, advance } = fixture()
    const pair = await sessions.open(identity)
    advance(24 * 3_600_000 - 1)
    const fresh = await sessions.refresh(pair.refreshToken)
    expect(await sessions.validate(fresh.accessToken, true)).toEqual(identity)
    advance(24 * 3_600_000 - 1)
    await sessions.refresh(pair.refreshToken)
    advance(1)
    await expect(sessions.refresh(pair.refreshToken)).rejects.toThrow('invalid_session')
  })

  it('сохраняет все параллельно выданные токены до отзыва и изолирует другие сессии', async () => {
    const { sessions, identity } = fixture()
    const pair = await sessions.open(identity)
    const independent = await sessions.open(identity)
    const refreshed = await Promise.all(
      Array.from({ length: 4 }, () => sessions.refresh(pair.refreshToken)),
    )
    const tokens = [pair.accessToken, ...refreshed.map((entry) => entry.accessToken)]
    expect(new Set(tokens).size).toBe(5)
    for (const token of tokens) expect(await sessions.validate(token, false)).toEqual(identity)
    await expect(sessions.refresh(pair.accessToken)).rejects.toThrow('invalid_session')
    await expect(sessions.validate(pair.refreshToken, true)).rejects.toThrow('invalid_session')
    const [race] = await Promise.all([
      Promise.allSettled([sessions.refresh(pair.refreshToken)]),
      sessions.revoke(pair.refreshToken),
    ])
    if (race[0].status === 'fulfilled') tokens.push(race[0].value.accessToken)
    await sessions.revoke(pair.refreshToken)
    for (const token of tokens)
      await expect(sessions.validate(token, true)).rejects.toThrow('invalid_session')
    await expect(sessions.refresh(pair.refreshToken)).rejects.toThrow('invalid_session')
    expect(await sessions.validate(independent.accessToken, true)).toEqual(identity)
  })
})
