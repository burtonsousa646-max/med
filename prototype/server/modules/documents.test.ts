// Документы: закрытие месяца по списаниям, НДС, отправка через ЭДО, статусы оператора, печатная форма, доступ.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { processHook } from '../integrations/hooks.ts'
import { charge } from './billing.ts'

before(resetDb)
after(() => sql.end())

const drain = async () => { while (await runOutbox()); }
const period = () => new Date().toISOString().slice(0, 7)

test('закрытие месяца: акт и счёт-фактура по списаниям, ЭДО, статус «подписан», повтор', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  await drain()
  const co = await (await a.req('/api/cabinet/company')).json()
  await a.req('/api/cabinet/company/edo', { method: 'POST', json: { operator: 'Диадок' } })
  const [cm] = await sql`insert into campaigns (company_id, type) values (${co.id}, 'click') returning id`
  await sql.begin(tx => charge(tx, { companyId: co.id, campaignId: cm.id, amountKop: 122000n, key: 'c1', memo: 'клики' }))
  await sql.begin(tx => charge(tx, { companyId: co.id, campaignId: cm.id, amountKop: 100000n, key: 'c2', memo: 'клики' }))

  const fin = client()
  await fin.loginStaff('finance', 'fin@beeline.ru')
  assert.equal((await a.req('/api/admin/documents/close-month', { method: 'POST', json: { period: period() } })).status, 401)
  assert.equal((await fin.req('/api/admin/documents/close-month', { method: 'POST', json: { period: '2026-13' } })).status, 422)
  assert.deepEqual(await (await fin.req('/api/admin/documents/close-month', { method: 'POST', json: { period: period() } })).json(), { companies: 1, created: 2 })
  assert.deepEqual(await (await fin.req('/api/admin/documents/close-month', { method: 'POST', json: { period: period() } })).json(), { companies: 1, created: 0 })

  await drain()
  let docs = await (await a.req('/api/cabinet/documents')).json()
  const act = docs.find((d: any) => d.kind === 'act')
  assert.deepEqual([act.amountKop, act.status], ['222000', 'sent'])
  const html = await (await a.req(`/api/cabinet/documents/${act.id}/file`)).text()
  assert.match(html, /в т\. ч\. НДС 22 %: 400,33 ₽/)
  assert.match(html, /ВымпелКом/)

  const [ref] = await sql`select external_id from external_refs where system = 'edo' and entity = 'document' and entity_id = ${act.id}`
  await processHook('edo', 'document.status', { externalId: ref.external_id, status: 'signed' }, 'edo-1')
  docs = await (await a.req('/api/cabinet/documents')).json()
  assert.equal(docs.find((d: any) => d.kind === 'act').status, 'signed')
  const [rev] = await sql`select 1 from external_refs where system = 'accounting' and entity = 'revenue'`
  assert.ok(rev)

  const b = client()
  await b.loginPartner('7702222222')
  assert.equal((await b.req(`/api/cabinet/documents/${act.id}/file`)).status, 404)
})
