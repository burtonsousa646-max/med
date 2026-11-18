// Сквозной сценарий приёмки: регистрация → кампания → оплата → ручная модерация → erid → показ → клик → списание → статистика → акт.
// Всё через HTTP, как браузер, поверхность и сотрудник; воркер вызываем руками, чтобы не ждать таймеров.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from './db.ts'
import { resetDb, client } from './testing.ts'
import { runOutbox } from './integrations/outbox.ts'
import { app } from './index.ts'
import { getIndex } from './modules/serving.ts'
import { chargeClicks } from './modules/settlement.ts'
import { rollup } from './modules/reporting.ts'

before(resetDb)
after(() => sql.end())
const drain = async () => { while (await runOutbox()); }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('от регистрации партнёра до акта за месяц', async () => {
  // 1. партнёр входит через бизнес-ID, компания проверяется по ЕГРЮЛ
  const p = client()
  assert.equal((await p.loginPartner('7712345678', 'Смирнова Ольга')).status, 302)
  await drain()
  let co = await (await p.req('/api/cabinet/company')).json()
  assert.equal(co.kycStatus, 'verified')
  await p.req('/api/cabinet/company/consents', { method: 'POST', json: { kind: 'company' } })
  await p.req('/api/cabinet/company/consents', { method: 'POST', json: { kind: 'signer' } })
  co = await (await p.req('/api/cabinet/company/points', { method: 'POST', json: { addr: 'ул. Мясницкая, 20' } })).json()
  assert.equal(co.points.length, 1)

  // 2. кампания: переход в витрине, ставка 25 ₽, текст про вино — уйдёт к модератору
  const c = await (await p.req('/api/cabinet/campaigns', { method: 'POST', json: { type: 'click' } })).json()
  await p.req(`/api/cabinet/campaigns/${c.id}`, { method: 'PATCH', json: { landingUrl: 'https://vino-bar.example.ru', placements: ['showcase'], bidKop: 2500, budgetMonthKop: 500000, adText: 'Вино и ужин у Мясницкой' } })

  // 3. отправка: оферта и оплата недостающих 5 000 ₽ через страницу шлюза
  const sub = await (await p.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true, payMethod: 'sbp', idempotencyKey: 'e2e' } })).json()
  assert.equal(sub.campaign.status, 'invoice')
  const pay = await p.req(new URL(sub.payment.confirmUrl).pathname, { method: 'POST', body: new URLSearchParams({ result: 'ok' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  assert.match(pay.headers.get('location')!, new RegExp(`/c/${c.id}/launch`))
  await drain()
  assert.equal((await (await p.req(`/api/cabinet/campaigns/${c.id}`)).json()).moderation.status, 'queued')

  // 4. модератор одобряет, ОРД выдаёт erid, кампания показывается
  const mod = client()
  await mod.loginStaff('moderator', 'mod@beeline.ru')
  const [task] = await (await mod.req('/api/admin/moderation')).json()
  await mod.req(`/api/admin/moderation/${task.id}`, { method: 'POST', json: { verdict: 'approved' } })
  await drain()
  const live = await (await p.req(`/api/cabinet/campaigns/${c.id}`)).json()
  assert.equal(live.status, 'live')
  const erid = live.liveCreative.erid

  // 5. приложение запрашивает рекламу рядом с точкой, карточка видна, абонент нажимает
  await getIndex(true)
  const { ads } = await (await app.request('/api/public/serve', { method: 'POST', body: JSON.stringify({ placement: 'showcase', medId: 'subscriber-1', lat: co.points[0].lat, lon: co.points[0].lon }), headers: { 'content-type': 'application/json' } })).json() as any
  assert.equal(ads[0].creative.erid, erid)
  await app.request(new URL(ads[0].impressionUrl).pathname, { method: 'POST' })
  await wait(550)
  const click = await app.request(new URL(ads[0].clickUrl).pathname)
  assert.match(click.headers.get('location')!, /^https:\/\/vino-bar\.example\.ru\?.*click_id=bl/)

  // 6. воркер списывает клик и пересчитывает статистику
  await sql`update clicks set created_at = created_at - interval '1 minute'`
  await chargeClicks()
  await rollup()
  const st = await (await p.req(`/api/cabinet/campaigns/${c.id}/stats`)).json()
  assert.deepEqual([st.totals.impressions, st.totals.billableClicks, st.totals.spendKop], [1, 1, '500']) // один участник — минимальная ставка 5 ₽
  const bal = await (await p.req('/api/cabinet/balance')).json()
  assert.equal(bal.availableKop, String(500000 + 300000 - 500)) // оплата + бонус − клик

  // 7. финансист закрывает месяц: акт на сумму списаний, документ уходит в ЭДО, если подключено
  await p.req('/api/cabinet/company/edo', { method: 'POST', json: { operator: 'Диадок' } })
  const fin = client()
  await fin.loginStaff('finance', 'fin@beeline.ru')
  await fin.req('/api/admin/documents/close-month', { method: 'POST', json: { period: new Date().toISOString().slice(0, 7) } })
  await drain()
  const docs = await (await p.req('/api/cabinet/documents')).json()
  const act = docs.find((d: any) => d.kind === 'act')
  assert.deepEqual([act.amountKop, act.status], ['500', 'sent'])
  assert.deepEqual(docs.map((d: any) => d.kind).sort(), ['act', 'offer', 'sf'])

  // деньги сходятся: сумма всех проводок — ноль, выручка билайна — ровно клик
  const [{ s }] = await sql`select coalesce(sum(balance_kop), 0)::text as s from account_balances`
  assert.equal(s, '0')
  const [{ r }] = await sql`select balance_kop::text as r from account_balances where kind = 'beeline_revenue'`
  assert.equal(r, '500')
})
