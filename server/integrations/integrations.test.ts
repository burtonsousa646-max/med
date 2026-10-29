// Слой интеграций: очередь без дублей и с ретраями, вебхуки с подписью и без повторной обработки, журнал без секретов.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb } from '../testing.ts'
import { app } from '../index.ts'
import { port, redact, checkPorts } from './index.ts'
import { enqueue, handle, runOutbox } from './outbox.ts'
import { onHook, sign } from './hooks.ts'

before(resetDb)
after(() => sql.end())

test('у каждого порта есть заглушка', () => checkPorts())

test('outbox: повтор с тем же ключом — одна задача, исполнитель получает payload', async () => {
  const got: unknown[] = []
  handle('ord', 'test', async p => { got.push(p) })
  await enqueue(sql, 'ord', 'test', { creativeId: 1 }, 'k1')
  await enqueue(sql, 'ord', 'test', { creativeId: 1 }, 'k1')
  assert.equal(await runOutbox(), 1)
  assert.deepEqual(got, [{ creativeId: 1 }])
  const [t] = await sql`select status from outbox where idempotency_key = 'k1'`
  assert.equal(t.status, 'done')
})

test('outbox: ошибка — повтор позже, после 8 попыток — failed', async () => {
  handle('edo', 'boom', async () => { throw new Error('недоступен') })
  await enqueue(sql, 'edo', 'boom', {}, 'k2')
  await runOutbox()
  let [t] = await sql`select status, attempts, last_error, next_at > now() as later from outbox where idempotency_key = 'k2'`
  assert.deepEqual([t.status, t.attempts, t.last_error, t.later], ['pending', 1, 'недоступен', true])
  await sql`update outbox set attempts = 7, next_at = now() where idempotency_key = 'k2'`
  await runOutbox()
  ;[t] = await sql`select status from outbox where idempotency_key = 'k2'`
  assert.equal(t.status, 'failed')
})

test('вебхук: подпись, повтор события, неизвестное событие', async () => {
  let calls = 0
  onHook('payments', 'payment.succeeded', async (body, tx) => {
    calls++
    await tx`insert into external_refs (entity, entity_id, system, external_id) values ('payment', ${body.paymentId}, 'payments', ${body.externalId})`
  })
  const body = JSON.stringify({ paymentId: 'p1', externalId: 'ext1' })
  const send = (sig: string, id = 'e1') =>
    app.request('/api/hooks/payments/payment.succeeded', { method: 'POST', body, headers: { 'x-signature': sig, 'x-event-id': id } })

  assert.equal((await send('sha256=00')).status, 401)
  const good = sign('dev-secret-payments', body)
  assert.deepEqual(await (await send(good)).json(), { ok: true, duplicate: false })
  assert.deepEqual(await (await send(good)).json(), { ok: true, duplicate: true })
  assert.equal(calls, 1)
  const [{ n }] = await sql`select count(*)::int as n from external_refs where external_id = 'ext1'`
  assert.equal(n, 1)
  assert.equal((await app.request('/api/hooks/payments/nope', { method: 'POST', body })).status, 404)
})

test('вызов порта пишется в журнал без секретов', async () => {
  await port('messaging').send({ channel: 'sms', to: '+79160000000', template: 'otp', params: { code: '123456' }, idempotencyKey: 'm1' })
  await new Promise(r => setTimeout(r, 50)) // журнал пишется без ожидания
  const [row] = await sql`select request from integration_log where system = 'messaging' order by id desc limit 1`
  assert.equal(row.request.to, '***')
  assert.equal(row.request.params.code, '***')
  assert.equal(row.request.idempotencyKey, 'm1')
  assert.deepEqual(redact({ token: 'x', nested: [{ password: 'y', ok: 1 }] }), { token: '***', nested: [{ password: '***', ok: 1 }] })
})

test('заглушки: ликвидированное юрлицо, отказ в согласии, erid', async () => {
  assert.equal((await port('companyRegistry').findByInn('7701230000'))?.status, 'liquidated')
  assert.equal(await port('consents').check({ medId: 'optout-1', purpose: 'ads' }), false)
  const { erid } = await port('ord').registerCreative({ creativeId: '1', contractRef: 'c', text: 't', kind: 'banner' })
  assert.match(erid, /^[1-9A-HJ-NP-Za-km-z]{11}$/)
})
