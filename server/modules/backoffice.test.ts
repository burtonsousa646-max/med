// Бэкофис: роли, блокировка компании убирает её из показа, остановка кампании, справочники и параметры с границами, повтор задачи.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox, enqueue, handle } from '../integrations/outbox.ts'
import { processHook } from '../integrations/hooks.ts'
import { app } from '../index.ts'
import { getIndex } from './serving.ts'

before(resetDb)
after(() => sql.end())
const drain = async () => { while (await runOutbox()); }
const serve = async () => ((await (await app.request('/api/public/serve', { method: 'POST', body: JSON.stringify({ placement: 'showcase' }), headers: { 'content-type': 'application/json' } })).json()) as any).ads

async function liveCampaign() {
  const a = client()
  await a.loginPartner('7701234567')
  await drain()
  await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: 'ул. Покровка, 12' } })
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: 300000, method: 'sbp', idempotencyKey: 'p' } })).json()
  await processHook('payments', 'payment.succeeded', { paymentId: r.payment.id, amountKop: 300000 }, 'gw')
  const c = await (await a.req('/api/cabinet/campaigns', { method: 'POST', json: { type: 'click' } })).json()
  await a.req(`/api/cabinet/campaigns/${c.id}`, { method: 'PATCH', json: { landingUrl: 'https://example.ru', placements: ['showcase'] } })
  await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true } })
  await drain()
  const co = await (await a.req('/api/cabinet/company')).json()
  return { a, campaignId: c.id as number, companyId: co.id as string }
}

test('роли: менеджер видит партнёров, но не меняет справочники; финансист не видит журнал интеграций', async () => {
  const mgr = client(), fin = client(), adm = client()
  await mgr.loginStaff('manager', 'mgr@beeline.ru')
  await fin.loginStaff('finance', 'fin@beeline.ru')
  await adm.loginStaff('admin', 'adm@beeline.ru')
  assert.equal((await mgr.req('/api/admin/companies')).status, 200)
  assert.equal((await mgr.req('/api/admin/placements/showcase', { method: 'PATCH', json: { minBidKop: 700 } })).status, 403)
  assert.equal((await fin.req('/api/admin/integrations')).status, 403)
  assert.equal((await adm.req('/api/admin/integrations')).status, 200)
  const ov = await (await adm.req('/api/admin/overview')).json()
  assert.ok(Array.isArray(ov.ports))
})

test('блокировка компании: кампании на паузе, из показа ушли, партнёр сам не возобновит', async () => {
  const { a, campaignId, companyId } = await liveCampaign()
  await getIndex(true)
  assert.equal((await serve()).length, 1)
  const mgr = client()
  await mgr.loginStaff('manager', 'mgr@beeline.ru')
  const found = await (await mgr.req('/api/admin/companies?q=7701')).json()
  assert.equal(found[0].id, companyId)
  assert.equal((await mgr.req(`/api/admin/companies/${companyId}/kyc`, { method: 'POST', json: { status: 'blocked' } })).status, 422) // без причины
  await mgr.req(`/api/admin/companies/${companyId}/kyc`, { method: 'POST', json: { status: 'blocked', reason: 'жалобы абонентов' } })
  assert.equal((await serve()).length, 0)
  assert.equal((await a.req(`/api/cabinet/campaigns/${campaignId}`, { method: 'PATCH', json: { paused: false } })).status, 403)
  const detail = await (await mgr.req(`/api/admin/companies/${companyId}`)).json()
  assert.deepEqual([detail.kycStatus, detail.kycReason, detail.campaigns[0].status], ['blocked', 'жалобы абонентов', 'paused'])
  // разблокировали — партнёр возобновляет сам
  await mgr.req(`/api/admin/companies/${companyId}/kyc`, { method: 'POST', json: { status: 'verified' } })
  assert.equal((await a.req(`/api/cabinet/campaigns/${campaignId}`, { method: 'PATCH', json: { paused: false } })).status, 200)
  await getIndex(true)
  assert.equal((await serve()).length, 1)

  // остановка нарушителя модератором: завершена, партнёр получает причину
  const mod = client()
  await mod.loginStaff('moderator', 'mod@beeline.ru')
  assert.equal((await mod.req(`/api/admin/campaigns/${campaignId}/stop`, { method: 'POST', json: { reason: '' } })).status, 422)
  await mod.req(`/api/admin/campaigns/${campaignId}/stop`, { method: 'POST', json: { reason: 'вводит в заблуждение' } })
  assert.equal((await (await a.req(`/api/cabinet/campaigns/${campaignId}`)).json()).status, 'finished')
  assert.equal((await serve()).length, 0)
  const [n] = await sql`select count(*)::int as n from audit_log where actor_type = 'staff'`
  assert.equal(n.n, 3)
})

test('справочники и параметры: границы значений, применяются к показу', async () => {
  const adm = client()
  await adm.loginStaff('admin', 'adm@beeline.ru')
  assert.equal((await adm.req('/api/admin/placements/showcase', { method: 'PATCH', json: { minBidKop: -1 } })).status, 422)
  await adm.req('/api/admin/placements/showcase', { method: 'PATCH', json: { minBidKop: 700, slots: 4 } })
  const pl = (await (await adm.req('/api/admin/placements')).json()).find((p: any) => p.id === 'showcase')
  assert.deepEqual([pl.minBidKop, pl.slots], ['700', 4])
  assert.equal((await adm.req('/api/admin/settings/vat_pct', { method: 'PATCH', json: { value: 99 } })).status, 422)
  assert.equal((await adm.req('/api/admin/settings/stop_words', { method: 'PATCH', json: { value: 1 } })).status, 404)
  await adm.req('/api/admin/settings/vat_pct', { method: 'PATCH', json: { value: 20 } })
  const [v] = await sql`select value from settings where key = 'vat_pct'`
  assert.equal(v.value, 20)
})

test('упавшая задача интеграции: видна в журнале, повтор по кнопке', async () => {
  let fail = true
  handle('edo', 'flaky', async () => { if (fail) throw new Error('ЭДО недоступен') })
  await enqueue(sql, 'edo', 'flaky', {}, 'flaky-1')
  await sql`update outbox set attempts = 7 where idempotency_key = 'flaky-1'`
  await runOutbox()
  const adm = client()
  await adm.loginStaff('admin', 'adm@beeline.ru')
  const { outbox } = await (await adm.req('/api/admin/integrations')).json()
  const t = outbox.find((o: any) => o.action === 'flaky')
  assert.deepEqual([t.status, t.lastError], ['failed', 'ЭДО недоступен'])
  fail = false
  await adm.req(`/api/admin/outbox/${t.id}/retry`, { method: 'POST' })
  await runOutbox()
  const [row] = await sql`select status from outbox where id = ${t.id}`
  assert.equal(row.status, 'done')
})
