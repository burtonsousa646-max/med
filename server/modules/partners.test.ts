// Партнёры: проверка юрлица, точки, приглашения, права ролей, оферта.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { stubState } from '../integrations/stubs.ts'

before(resetDb)
after(() => sql.end())

test('проверка юрлица: действующее — verified, ликвидированное — rejected', async () => {
  const a = client(), b = client()
  await a.loginPartner('7701234567')
  await b.loginPartner('7701230000')
  assert.equal((await (await a.req('/api/cabinet/company')).json()).kycStatus, 'pending')
  await runOutbox()
  const coA = await (await a.req('/api/cabinet/company')).json()
  assert.equal(coA.kycStatus, 'verified')
  assert.ok(coA.ogrn)
  const coB = await (await b.req('/api/cabinet/company')).json()
  assert.deepEqual([coB.kycStatus, coB.kycReason], ['rejected', 'компания ликвидирована или ликвидируется'])
  await runOutbox() // контрагент в учётной системе — только для проверенной
  const refs = await sql`select entity_id from external_refs where system = 'accounting'`
  assert.deepEqual(refs.map(r => r.entity_id), [coA.id])
})

test('точки: геокодер, нельзя выключить последнюю', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  let co = await (await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: 'ул. Покровка, 12' } })).json()
  assert.equal(co.points.length, 1)
  assert.ok(co.points[0].lat > 55)
  const id = co.points[0].id
  assert.equal((await a.req(`/api/cabinet/company/points/${id}`, { method: 'PATCH', json: { active: false } })).status, 422)
  co = await (await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: 'Ленинский пр-т, 45' } })).json()
  assert.equal((await a.req(`/api/cabinet/company/points/${id}`, { method: 'PATCH', json: { active: false } })).status, 200)
  assert.equal((await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: '  ' } })).status, 422)
})

test('приглашение бухгалтера: письмо, вход по почте, принятие, права', async () => {
  const owner = client()
  await owner.loginPartner('7701234567')
  assert.equal((await owner.req('/api/cabinet/company/invitations', { method: 'POST', json: { email: 'buh@example.ru', role: 'owner' } })).status, 422)
  await owner.req('/api/cabinet/company/invitations', { method: 'POST', json: { email: 'buh@example.ru', role: 'accountant' } })
  const url = stubState.messages.findLast(m => m.template === 'invitation')!.params.url
  const t = url.split('/invite/')[1]

  const buh = client()
  await buh.req('/api/auth/email/start', { method: 'POST', json: { email: 'buh@example.ru' } })
  const code = stubState.messages.findLast(m => m.template === 'login_code')!.params.code
  await buh.req('/api/auth/email/verify', { method: 'POST', json: { email: 'buh@example.ru', code } })
  assert.equal((await buh.req(`/api/auth/invitations/${t}/accept`, { method: 'POST' })).status, 200)
  assert.equal((await client().req(`/api/auth/invitations/${t}/accept`, { method: 'POST' })).status, 401)
  assert.equal((await buh.req(`/api/auth/invitations/${t}/accept`, { method: 'POST' })).status, 404) // одноразовое

  const co = await (await buh.req('/api/cabinet/company')).json()
  assert.equal(co.members.find((m: any) => m.email === 'buh@example.ru').role, 'accountant')
  // бухгалтер не меняет реквизиты и не приглашает, но подключает ЭДО
  assert.equal((await buh.req('/api/cabinet/company', { method: 'PATCH', json: { brand: 'x' } })).status, 403)
  assert.equal((await buh.req('/api/cabinet/company/invitations', { method: 'POST', json: { email: 'a@b.ru', role: 'staff' } })).status, 403)
  assert.equal((await buh.req('/api/cabinet/company/edo', { method: 'POST', json: { operator: 'Диадок' } })).status, 200)
  // и не принимает оферту: не подписант
  assert.equal((await buh.req('/api/cabinet/company/offer', { method: 'POST' })).status, 403)

  // владелец удаляет бухгалтера — его сессия в компании закрыта
  const buhId = co.members.find((m: any) => m.email === 'buh@example.ru').id
  await owner.req(`/api/cabinet/company/members/${buhId}`, { method: 'DELETE' })
  assert.equal((await buh.req('/api/cabinet/company')).status, 401)
})

test('реквизиты: проверка формата, владелец меняет', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  assert.equal((await a.req('/api/cabinet/company', { method: 'PATCH', json: { bank: { bik: '123', account: '1' } } })).status, 422)
  const co = await (await a.req('/api/cabinet/company', { method: 'PATCH', json: { brand: 'кофейня «Зерно»', bank: { bik: '044525593', account: '40702 810 0 0000 0012345 00'.replace(/ /g, '').slice(0, 20), bank: 'Альфа-Банк' } } })).json()
  assert.equal(co.brand, 'кофейня «Зерно»')
  assert.equal(co.bank.account.length, 20)
})

test('оферта: подписант принимает, документ появляется один раз', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  await a.req('/api/cabinet/company/offer', { method: 'POST' })
  const co = await (await a.req('/api/cabinet/company/offer', { method: 'POST' })).json()
  assert.equal(co.offerVersion, co.currentOfferVersion)
  const [{ n }] = await sql`select count(*)::int as n from documents where kind = 'offer' and company_id = ${co.id}`
  assert.equal(n, 1)
})

test('вошёл по почте и добавил компанию: владелец без права подписи; занятый ИНН — 409', async () => {
  const a = client()
  await a.req('/api/auth/email/start', { method: 'POST', json: { email: 'new@example.ru' } })
  const code = stubState.messages.findLast(m => m.template === 'login_code')!.params.code
  await a.req('/api/auth/email/verify', { method: 'POST', json: { email: 'new@example.ru', code } })
  assert.equal((await a.req('/api/auth/companies', { method: 'POST', json: { inn: '7701234567' } })).status, 409)
  const co = await (await a.req('/api/auth/companies', { method: 'POST', json: { inn: '7709999999' } })).json()
  assert.equal(co.members[0].signer, false)
  assert.equal((await a.req('/api/cabinet/company')).status, 200)
})
