// День 3: аукцион на одинаковых данных, путь «показ → клик → результат → деньги», выплаты, статистика.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { processHook } from '../integrations/hooks.ts'
import { app } from '../index.ts'
import { auction, getIndex } from './serving.ts'
import { chargeClicks, runPayouts, settleConversions } from './settlement.ts'
import { rollup } from './reporting.ts'

before(resetDb)
after(() => sql.end())

const drain = async () => { while (await runOutbox()); }
type C = ReturnType<typeof client>

async function partnerWith(inn: string, topUpKop = 0) {
  const a = client()
  await a.loginPartner(inn)
  await drain()
  await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: `ул. Тестовая, ${inn.slice(-3)}` } })
  if (topUpKop) {
    const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop: topUpKop, method: 'sbp', idempotencyKey: 'top' + inn } })).json()
    await processHook('payments', 'payment.succeeded', { paymentId: r.payment.id, amountKop: topUpKop }, 'gw' + inn)
  }
  return a
}
async function live(a: C, type: string, patch: Record<string, unknown> = {}) {
  const c = await (await a.req('/api/cabinet/campaigns', { method: 'POST', json: { type } })).json()
  await a.req(`/api/cabinet/campaigns/${c.id}`, { method: 'PATCH', json: { landingUrl: 'https://example.ru/shop', placements: ['showcase'], ...patch } })
  const r = await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true, idempotencyKey: 's' + c.id } })
  assert.equal(r.status, 200, await r.clone().text())
  await drain()
  const cm = await (await a.req(`/api/cabinet/campaigns/${c.id}`)).json()
  assert.equal(cm.status, 'live')
  return cm
}
const serve = async (body: Record<string, unknown>) => (await app.request('/api/public/serve', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })).json() as Promise<any>
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const pathOf = (url: string) => new URL(url).pathname

test('аукцион: скор, вторая цена, одна реклама от компании, фильтры денег и гео', () => {
  const pl = { id: 'showcase', slots: 2, minBidKop: 500, baseCtr: 0.03, pricing: 'cpc', needsConsent: false }
  const base = { type: 'click', placements: ['showcase'], wide: false, signals: {}, radiusM: 1000, dailyCapKop: null, budgetKop: 1_000_000, startsAt: null, endsAt: null,
    landingUrl: 'https://x.ru', terms: {}, adText: '', imageKey: null, erid: 'e', brand: '', name: '', site: null, feePct: 0, share: false,
    points: [{ lat: 55.75, lon: 37.6 }], impressions: 0, clicks: 0, spentTodayKop: 0, spentMonthKop: 0, companyAvailableKop: 100_000, postpay: false }
  const e = (id: number, companyId: string, bidKop: number, extra = {}) => ({ ...base, id, companyId, bidKop, creativeId: id, ...extra })
  const idx = { at: 0, placements: new Map([['showcase', pl]]), triggerFloor: new Map(), markupPct: 30, resultRate: {}, priorWeight: 200,
    entries: [e(1, 'a', 3000), e(2, 'b', 2000), e(3, 'a', 2500), e(4, 'c', 1000), e(5, 'd', 5000, { companyAvailableKop: 0 }), e(6, 'e', 9000, { spentMonthKop: 1_000_000 })] }
  const won = auction(idx as never, { placement: 'showcase', medId: null })
  // 5 — нет денег, 6 — бюджет месяца исчерпан, 3 — вторая реклама компании a
  assert.deepEqual(won.map(w => w.entry.id), [1, 2])
  // одинаковый CTR: первый платит ставку второго + 1 коп., второй — ставку третьего (4) + 1 коп.
  assert.deepEqual(won.map(w => w.priceKop), [2001, 1001])
  // абонент далеко от точек — никого
  assert.equal(auction(idx as never, { placement: 'showcase', medId: null, lat: 59.9, lon: 30.3 }).length, 0)
  // на одинаковых данных — одинаковый результат
  assert.deepEqual(auction(idx as never, { placement: 'showcase', medId: null }).map(w => [w.entry.id, w.priceKop]), won.map(w => [w.entry.id, w.priceKop]))
  // сигналы: «и» без совпадения у абонента — мимо
  idx.entries = [e(7, 'f', 3000, { signals: { moved: 'and' } })]
  assert.equal(auction(idx as never, { placement: 'showcase', medId: 'm1', matched: {} }).length, 0)
  assert.equal(auction(idx as never, { placement: 'showcase', medId: 'm1', matched: { moved: 0.8 } }).length, 1)
})

test('переход: показ, клик с click_id, правила оплаты, списание пачкой, частота, нет денег — нет показа', async () => {
  const a = await partnerWith('7701111111', 300000)
  const cm = await live(a, 'click', { bidKop: 2000 })
  await getIndex(true)
  const { ads } = await serve({ placement: 'showcase', medId: 'dev-1' })
  assert.equal(ads.length, 1)
  assert.equal(ads[0].creative.erid, cm.liveCreative.erid)
  assert.equal((await app.request(pathOf(ads[0].impressionUrl), { method: 'POST' })).status, 204)
  assert.equal((await app.request(pathOf(ads[0].impressionUrl), { method: 'POST' })).status, 204) // повтор маяка — один показ
  assert.equal((await sql`select count(*)::int as n from impressions`)[0].n, 1)

  // клик быстрее 0,5 с — бесплатный
  const fast = await app.request(pathOf(ads[0].clickUrl) + '?format=json')
  assert.equal((await sql`select reason from clicks where click_id = ${(await fast.json() as any).clickId}`)[0].reason, 'tooFast')
  await wait(550)
  const res = await app.request(pathOf(ads[0].clickUrl))
  assert.equal(res.status, 302)
  const loc = new URL(res.headers.get('location')!)
  assert.equal(loc.origin + loc.pathname, 'https://example.ru/shop')
  assert.match(loc.searchParams.get('click_id')!, /^bl/)
  // повтор того же абонента за 24 ч — бесплатный; бот — бесплатный
  await app.request(pathOf(ads[0].clickUrl))
  await app.request(pathOf(ads[0].clickUrl), { headers: { 'user-agent': 'python-requests' } })
  const reasons = (await sql`select reason from clicks order by created_at`).map(r => r.reason)
  assert.deepEqual(reasons, ['tooFast', null, 'repeat24h', 'fraud'])

  await sql`update clicks set created_at = created_at - interval '1 minute'`
  await chargeClicks()
  await chargeClicks() // повтор ничего не списывает
  const [{ price }] = await sql`select cost_kop::int as price from clicks where billable`
  assert.equal(price, 500) // единственный участник платит минимальную ставку места, а не свои 20 ₽
  const bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(BigInt(bal.availableKop), 600000n - BigInt(price)) // 3 000 ₽ + 3 000 ₽ бонус − клик
  assert.equal(bal.operations[0].kind, 'charge')

  // частота: три показа одному абоненту за неделю — дальше не показываем
  for (let i = 0; i < 2; i++) {
    const r = await serve({ placement: 'showcase', medId: 'dev-1' })
    await app.request(pathOf(r.ads[0].impressionUrl), { method: 'POST' })
  }
  assert.equal((await serve({ placement: 'showcase', medId: 'dev-1' })).ads.length, 0)
  assert.equal((await serve({ placement: 'showcase', medId: 'optout-1' })).ads.length, 0) // нет согласия на рекламу

  // деньги кончились — кампания выпадает из показа
  await sql`update campaigns set budget_month_kop = 1 where id = ${cm.id}`
  await getIndex(true)
  assert.equal((await serve({ placement: 'showcase', medId: 'dev-2' })).ads.length, 0)
})

test('заявка: форма в приложении, постбэк партнёра, спор, списание за засчитанную', async () => {
  const a = await partnerWith('7702222222', 300000)
  const cm = await live(a, 'lead', { terms: { what: 'консультация', price: '600', via: 'API' } })
  await getIndex(true)
  const { ads } = await serve({ placement: 'showcase', medId: 'dev-3' })
  const ad = ads.find((x: any) => x.campaignId === cm.id)
  await wait(550)
  const { clickId } = await (await app.request(pathOf(ad.clickUrl) + '?format=json')).json() as any
  assert.equal((await app.request(`/api/public/act/${clickId}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status, 422)
  await app.request(`/api/public/act/${clickId}`, { method: 'POST', body: JSON.stringify({ name: 'Анна', phone: '+7 916 000-00-00' }), headers: { 'content-type': 'application/json' } })

  // ключ сервера партнёра: показываем один раз, храним хеш
  const { key } = await (await a.req('/api/cabinet/tracking/keys', { method: 'POST' })).json()
  assert.equal((await app.request(`/api/public/postback?key=bad&click_id=${clickId}&order_id=x`)).status, 401)
  const pb = (order: string, status: string) => app.request(`/api/public/postback?key=${key}&click_id=${clickId}&order_id=${order}&status=${status}`)
  assert.equal((await pb('crm-1', 'pending')).status, 200)
  assert.equal((await pb('crm-1', 'approved')).status, 200)
  assert.equal((await pb('crm-1', 'pending')).status, 422) // назад нельзя
  const conv = await (await a.req(`/api/cabinet/conversions?campaignId=${cm.id}`)).json()
  assert.deepEqual(conv.map((v: any) => [v.source, v.status]).sort(), [['form', 'pending'], ['postback', 'approved']])

  // заявку из формы партнёр оспаривает в кабинете
  const form = conv.find((v: any) => v.source === 'form')
  assert.equal((await (await a.req(`/api/cabinet/conversions/${form.id}`, { method: 'PATCH', json: { status: 'rejected', note: 'не дозвонились' } })).json()).status, 'rejected')
  await settleConversions()
  await settleConversions()
  const bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.availableKop, String(600000 - 60000)) // одна засчитанная заявка по 600 ₽
})

test('промокод файлом CSV: создание, обновление, ошибки строк, возврат денег по возврату заказа', async () => {
  const a = await partnerWith('7703333333', 300000)
  const cm = await live(a, 'promo')
  await getIndex(true)
  const { ads } = await serve({ placement: 'showcase', medId: 'dev-4' })
  await wait(550)
  const { clickId } = await (await app.request(pathOf(ads.find((x: any) => x.campaignId === cm.id).clickUrl) + '?format=json')).json() as any
  const csv = `click_id;order_id;status;amount\n${clickId};A-1;approved;1200\n${clickId};A-2;pending;\nnope;A-3;approved;100\n`
  const r = await (await a.req('/api/cabinet/conversions/import', { method: 'POST', body: csv, headers: { 'content-type': 'text/csv' } })).json()
  assert.deepEqual([r.created, r.updated, r.errors.map((e: any) => e.line)], [1, 0, [3, 4]]) // A-2 без суммы, nope — чужой click_id
  await settleConversions()
  let bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.availableKop, String(600000 - 9600)) // 8 % с 1 200 ₽
  await a.req('/api/cabinet/conversions/import', { method: 'POST', body: `${clickId};A-1;returned;1200`, headers: { 'content-type': 'text/csv' } })
  await settleConversions()
  bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.availableKop, '600000')
})

test('купон: оплата со счёта телефона, выплата партнёру за месяц, статистика', async () => {
  const a = await partnerWith('7704444444')
  await a.req('/api/cabinet/company', { method: 'PATCH', json: { bank: { bik: '044525593', account: '40702810000000012345', bank: 'Альфа-Банк' } } })
  const cm = await live(a, 'coupon')
  await getIndex(true)
  const { ads } = await serve({ placement: 'showcase', medId: 'dev-5' })
  const ad = ads.find((x: any) => x.campaignId === cm.id)
  await app.request(pathOf(ad.impressionUrl), { method: 'POST' })
  await wait(550)
  const { clickId } = await (await app.request(pathOf(ad.clickUrl) + '?format=json')).json() as any
  const act = await app.request(`/api/public/act/${clickId}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
  assert.equal(act.status, 200)
  await settleConversions()
  let bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.payoutKop, '28000') // купон 350 ₽, комиссия билайна 20 %

  const period = new Date().toISOString().slice(0, 7)
  assert.deepEqual(await runPayouts(period), { companies: 1, created: 1 })
  assert.deepEqual(await runPayouts(period), { companies: 0, created: 0 })
  await drain()
  const [p] = await sql`select status, net_kop::int as net from payouts`
  assert.deepEqual([p.status, p.net], ['sent', 28000])
  bal = await (await a.req('/api/cabinet/balance')).json()
  assert.equal(bal.payoutKop, '0')

  await rollup()
  const st = await (await a.req(`/api/cabinet/campaigns/${cm.id}/stats`)).json()
  assert.deepEqual([st.totals.impressions, st.totals.clicks, st.totals.results.approved, st.totals.payoutKop], [1, 1, 1, '28000'])
  assert.equal(st.placements[0].placement, 'showcase')
  const ledger = await sql`select coalesce(sum(balance_kop), 0)::text as s from account_balances`
  assert.equal(ledger[0].s, '0')
})
