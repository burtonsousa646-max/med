// Деньги: пополнение через шлюз, бонус первой оплаты, повторы без задвоения, счёт по выписке, списание, корректировка.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { processHook, sign } from '../integrations/hooks.ts'
import { app } from '../index.ts'
import { charge } from './billing.ts'

before(resetDb)
after(() => sql.end())

async function verifiedPartner(inn = '7701234567') {
  const a = client()
  await a.loginPartner(inn)
  await runOutbox()
  return a
}
const ledgerZero = async () => assert.equal((await sql`select coalesce(sum(balance_kop), 0)::text as s from account_balances`)[0].s, '0')

test('до проверки компании оплата закрыта', async () => {
  const a = client()
  await a.loginPartner('7705555555')
  const res = await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 500000, method: 'sbp', idempotencyKey: 'p0' } })
  assert.equal(res.status, 422)
})

test('СБП: страница шлюза, зачисление, бонус за первую оплату, повтор вебхука', async () => {
  const a = await verifiedPartner()
  assert.equal((await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 100, method: 'sbp', idempotencyKey: 'small' } })).status, 422)
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 1000000, method: 'sbp', idempotencyKey: 'p1' } })).json()
  assert.equal(r.payment.status, 'pending')
  assert.match(r.confirmUrl, /\/api\/stub\/pay\//)
  // повтор запроса с тем же ключом — тот же платёж
  const again = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 1000000, method: 'sbp', idempotencyKey: 'p1' } })).json()
  assert.equal(again.payment.id, r.payment.id)

  // платёжная страница заглушки шлёт вебхук «оплачено»
  const page = await a.req(new URL(r.confirmUrl).pathname, { method: 'POST', body: new URLSearchParams({ result: 'ok' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.equal(page.status, 302)
  let bal = await (await a.req('/api/cabinet/balance')).json()
  assert.deepEqual([bal.mainKop, bal.bonusKop, bal.availableKop], ['1000000', '300000', '1300000'])
  assert.equal(bal.operations.length, 2)

  // шлюз прислал то же событие ещё раз, уже подписанным вебхуком с другим ID — денег не прибавилось
  const body = JSON.stringify({ paymentId: r.payment.id, amountKop: 1000000 })
  const res = await app.request('/api/hooks/payments/payment.succeeded', { method: 'POST', body, headers: { 'x-signature': sign('dev-secret-payments', body), 'x-event-id': 'gw-1' } })
  assert.equal(res.status, 200)
  bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.mainKop, '1000000')

  // вторая оплата — без бонуса
  const r2 = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 200000, method: 'card', idempotencyKey: 'p2' } })).json()
  await processHook('payments', 'payment.succeeded', { paymentId: r2.payment.id, amountKop: 200000 }, 'gw-2')
  bal = await (await a.req('/api/cabinet/balance')).json()
  assert.deepEqual([bal.mainKop, bal.bonusKop], ['1200000', '300000'])
  await ledgerZero()
})

test('сумма в вебхуке не совпала — не зачисляется', async () => {
  const a = await verifiedPartner('7702222222')
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 500000, method: 'sbp', idempotencyKey: 'x' } })).json()
  await processHook('payments', 'payment.succeeded', { paymentId: r.payment.id, amountKop: 1 }, 'gw-x')
  const p = await (await a.req(`/api/cabinet/payments/${r.payment.id}`)).json()
  assert.equal(p.status, 'failed')
  assert.equal((await (await a.req('/api/cabinet/balance')).json()).mainKop, '0')
})

test('счёт-оферта: номер, документ, оплата по выписке; чужой ИНН — ждёт финансиста', async () => {
  const a = await verifiedPartner('7703333333')
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 3000000, method: 'invoice', idempotencyKey: 'inv' } })).json()
  assert.match(r.invoice.number, /^РП-\d{4}-\d{6}$/)
  const [doc] = await sql`select kind, status from documents where number = ${r.invoice.number}`
  assert.deepEqual([doc.kind, doc.status], ['invoice', 'issued'])

  await processHook('bankStatement', 'incoming', { externalId: 'b1', amountKop: 3000000, payerInn: '7709999999', purpose: `Оплата по счёту ${r.invoice.number}` }, 'b1')
  assert.equal((await (await a.req('/api/cabinet/balance')).json()).mainKop, '0')
  const [un] = await sql`select 1 from audit_log where action = 'bank.unmatched' and entity_id = 'b1'`
  assert.ok(un)

  await processHook('bankStatement', 'incoming', { externalId: 'b2', amountKop: 3000000, payerInn: '7703333333', purpose: `Оплата по счёту ${r.invoice.number}, без НДС` }, 'b2')
  const bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.mainKop, '3000000')
  assert.equal(bal.invoices.length, 0)
})

test('финансист отмечает оплату счёта и делает корректировку; партнёру и модератору нельзя', async () => {
  const a = await verifiedPartner('7704444444')
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 150000, method: 'invoice', idempotencyKey: 'inv2' } })).json()
  const fin = client(), mod = client()
  await fin.loginStaff('finance', 'fin@beeline.ru')
  await mod.loginStaff('moderator', 'mod@beeline.ru')
  assert.equal((await mod.req(`/api/admin/invoices/${r.invoice.id}/paid`, { method: 'POST' })).status, 403)
  assert.equal((await a.req(`/api/admin/invoices/${r.invoice.id}/paid`, { method: 'POST' })).status, 401)
  assert.equal((await (await fin.req(`/api/admin/invoices/${r.invoice.id}/paid`, { method: 'POST' })).json()).changed, true)
  assert.equal((await (await fin.req(`/api/admin/invoices/${r.invoice.id}/paid`, { method: 'POST' })).json()).changed, false)

  const co = await (await a.req('/api/cabinet/company')).json()
  const adj = { companyId: co.id, amountKop: -50000, account: 'main', memo: 'возврат ошибочного зачисления', idempotencyKey: 'adj1' }
  assert.equal((await fin.req('/api/admin/adjustments', { method: 'POST', json: { ...adj, memo: '' } })).status, 422)
  await fin.req('/api/admin/adjustments', { method: 'POST', json: adj })
  await fin.req('/api/admin/adjustments', { method: 'POST', json: adj })
  assert.equal((await (await a.req('/api/cabinet/balance')).json()).mainKop, '100000')
  await ledgerZero()
})

test('списание: сначала бонусы, потом основной счёт', async () => {
  const a = await verifiedPartner('7706666666')
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 100000, method: 'sbp', idempotencyKey: 'c' } })).json()
  await processHook('payments', 'payment.succeeded', { paymentId: r.payment.id, amountKop: 100000 }, 'gw-c')
  const co = await (await a.req('/api/cabinet/company')).json()
  const [cmp] = await sql`insert into campaigns (company_id, type) values (${co.id}, 'click') returning id`
  await sql.begin(tx => charge(tx, { companyId: co.id, campaignId: cmp.id, amountKop: 350000n, key: 'ch2', memo: 'клики' }))
  const bal = await (await a.req('/api/cabinet/balance')).json()
  assert.deepEqual([bal.bonusKop, bal.mainKop], ['0', '50000'])
  await ledgerZero()
})
