// Вход и доступ: бизнес-ID, код на почту, SSO сотрудников, изоляция компаний.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { stubState } from '../integrations/stubs.ts'

before(resetDb)
after(() => sql.end())

test('вход через бизнес-ID: человек становится владельцем и подписантом компании', async () => {
  const a = client()
  const res = await a.loginPartner('7701234567')
  assert.equal(res.status, 302)
  assert.match(res.headers.get('location')!, /\/cabinet$/)
  const co = await (await a.req('/api/cabinet/company')).json()
  assert.equal(co.inn, '7701234567')
  const me = await (await a.req('/api/auth/me')).json()
  assert.deepEqual([me.companies[0].role, me.companies[0].signer], ['owner', true])
  // повторный вход — тот же человек, не новый
  await a.loginPartner('7701234567')
  const [{ n }] = await sql`select count(*)::int as n from users`
  assert.equal(n, 1)
})

test('чужая компания недоступна', async () => {
  const a = client(), b = client()
  await a.loginPartner('7701234567')
  await b.loginPartner('7702222222', 'Петров Пётр')
  const coA = await (await a.req('/api/cabinet/company')).json()
  assert.equal((await b.req('/api/auth/company', { method: 'POST', json: { companyId: coA.id } })).status, 403)
  assert.equal((await (await b.req('/api/cabinet/company')).json()).inn, '7702222222')
  assert.equal((await client().req('/api/cabinet/company')).status, 401)
})

test('колбэк без своего state не пускает', async () => {
  const res = await client().req('/api/auth/callback/sber?code=x&state=y')
  assert.equal(res.status, 422)
})

test('вход по коду на почту: неверный код, верный, без компании кабинет закрыт', async () => {
  const a = client()
  assert.equal((await a.req('/api/auth/email/start', { method: 'POST', json: { email: 'Buh@Example.ru' } })).status, 200)
  assert.equal((await a.req('/api/auth/email/start', { method: 'POST', json: { email: 'buh@example.ru' } })).status, 429)
  const code = stubState.messages.findLast(m => m.template === 'login_code')!.params.code
  assert.equal((await a.req('/api/auth/email/verify', { method: 'POST', json: { email: 'buh@example.ru', code: '000000' === code ? '111111' : '000000' } })).status, 422)
  assert.equal((await a.req('/api/auth/email/verify', { method: 'POST', json: { email: 'buh@example.ru', code } })).status, 200)
  assert.equal((await a.req('/api/cabinet/company')).status, 403)
  assert.equal((await (await a.req('/api/auth/me')).json()).user.email, 'buh@example.ru')
  // код одноразовый
  assert.equal((await client().req('/api/auth/email/verify', { method: 'POST', json: { email: 'buh@example.ru', code } })).status, 422)
})

test('сотрудник билайна: роли из SSO, партнёру бэкофис закрыт', async () => {
  const s = client()
  assert.equal((await s.loginStaff('moderator')).status, 302)
  assert.equal((await s.req('/api/admin/ports')).status, 200)
  assert.equal((await s.req('/api/cabinet/company')).status, 401)
  const p = client()
  await p.loginPartner('7701234567')
  assert.equal((await p.req('/api/admin/ports')).status, 401)
  assert.equal((await client().loginStaff('', 'nobody@beeline.ru')).status, 403)
})

test('выход завершает сессию', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  const sid = a.jar.get('sid')!
  await a.req('/api/auth/logout', { method: 'POST' })
  a.jar.set('sid', sid) // старый токен больше не действует
  assert.equal((await a.req('/api/cabinet/company')).status, 401)
})
