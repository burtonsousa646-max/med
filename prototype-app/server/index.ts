// Тестовый сервер по контракту api/openapi.yaml. Запуск: npm run server (порт 8787).
// Настоящий бэкенд заменяет эту папку целиком; интерфейс об этом не узнает.
import { Hono, type Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { serve } from '@hono/node-server'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { components } from '../src/api.gen.ts'
import * as db from './db.ts'
import { allow, ask, checkAsk } from './ask.ts'
import { createBusinessLookup } from './business-lookup.ts'
import { CO, DEFAULT_TERMS, DISPUTE_DAYS, KIND, OFFER_TYPES, SLOTS, catalog, clickCampaign, deal, launched, newClickId, payAmount, payout, spent, stats, trackingUrl, view, type CampaignRow, type OfferType } from './domain.ts'

type S = components['schemas']
type Env = { Variables: { cid: string } }
const fail = (c: Context, status: 400 | 401 | 404 | 409 | 429, message: string) => c.json({ message }, status)

export const app = new Hono<Env>().basePath('/api')
app.get('/health', c => {
  db.db.prepare('select 1').get()
  return c.json({ status: 'ok' })
})
app.route('/business', createBusinessLookup())

/* ───────── демо-копия компании по cookie. Справочники и подтверждение по ссылке её не требуют ───────── */
const COOKIE = 'demo'
const newDemo = (c: Context<Env>) => {
  const id = db.createCompany()
  setCookie(c, COOKIE, id, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'Lax', path: '/', maxAge: 365 * 864e2 })
  return id
}
app.use('*', async (c, next) => {
  const path = c.req.path.replace(/^\/api/, '')
  if (path === '/catalog' || path === '/postback' || path.startsWith('/approvals/')) return next()
  let id = getCookie(c, COOKIE)
  if (!id || !db.companyExists(id)) id = newDemo(c)
  else db.touch(id)
  c.set('cid', id)
  await next()
})

/* ───────── справочники и сессия ───────── */
app.get('/catalog', c => c.json(catalog()))
app.get('/session', c => c.json(db.getSession(c.var.cid)))
app.patch('/session', async c => {
  const { role, clock } = await c.req.json<S['SessionPatch']>()
  return c.json(db.setSession(c.var.cid, { ...(role && { role }), ...(clock && { clock }) }))
})
app.post('/session/login', async c => {
  const { provider } = await c.req.json<{ provider: S['ProviderId'] }>()
  if (!['gos', 'sber', 'alfa', 'inn'].includes(provider)) return fail(c, 400, 'неизвестный способ входа')
  return c.json(db.setSession(c.var.cid, { provider }))
})
app.post('/session/reset', c => {
  db.deleteCompany(c.var.cid)
  return c.json(db.getSession(newDemo(c)))
})

/* ───────── компания ───────── */
app.get('/company', c => c.json(db.getCompany(c.var.cid)))
app.patch('/company', async c => {
  const { segment, consents, notify, autoTopup, edo } = await c.req.json<S['CompanyPatch']>()
  db.patchCompany(c.var.cid, { ...(segment && { segment }), ...(consents && { consents }), ...(notify && { notify }), ...(autoTopup !== undefined && { autoTopup }), ...(edo && { edo }) })
  return c.json(db.getCompany(c.var.cid))
})
app.post('/company/points', async c => {
  const addr = String((await c.req.json<{ addr: string }>()).addr ?? '').trim()
  if (addr.length < 5) return fail(c, 400, 'адрес короче 5 символов')
  db.addPoint(c.var.cid, addr, SLOTS[(db.pointCount(c.var.cid) - 2 + SLOTS.length) % SLOTS.length])
  return c.json(db.getCompany(c.var.cid))
})
app.patch('/company/points/:pointId', async c => {
  const { active } = await c.req.json<{ active: boolean }>()
  if (!active && db.activePoints(c.var.cid) <= 1) return fail(c, 409, 'в рекламе должна остаться хотя бы одна точка')
  if (!db.setPointActive(c.var.cid, +c.req.param('pointId'), active)) return fail(c, 404, 'точка не найдена')
  return c.json(db.getCompany(c.var.cid))
})
app.post('/company/members', async c => {
  const email = String((await c.req.json<{ email: string }>()).email ?? '').trim()
  if (!/.+@.+\..+/.test(email)) return fail(c, 400, 'проверьте адрес почты')
  db.addMember(c.var.cid, email)
  return c.json(db.getCompany(c.var.cid))
})

/* ───────── кампании ───────── */
const show = (cid: string, row: CampaignRow) => view(row, db.activePoints(cid), db.getSession(cid).clock, db.partnerEventAt(cid, row.id))
const find = (c: Context<Env>) => db.getCampaign(c.var.cid, +c.req.param('id')!)

// Отправка на запуск: деньги на баланс (кроме купона, подписки и счёта), потом проверка и показы
function launch(cid: string, row: CampaignRow) {
  const share = OFFER_TYPES[row.type].share
  if (!share && row.payMethod === 'invoice' && row.status !== 'invoice') return { ...row, status: 'invoice' as const }
  seedConversions(cid, row)
  if (!share) {
    const first = !db.listOperations(cid).some(o => o.title.startsWith('бонус'))
    db.addOperation(cid, row.payMethod === 'post' ? 'постоплата, лимит по договору' : `пополнение, ${row.payMethod === 'card' ? 'бизнес-карта' : row.payMethod === 'invoice' ? 'счёт-оферта' : 'СБП'}`, payAmount(row))
    if (first) db.addOperation(cid, 'бонус за первую кампанию', 3000)
  }
  return { ...row, status: 'moderation' as const, submittedAt: new Date().toISOString() }
}
const needsPay = (row: CampaignRow) => !OFFER_TYPES[row.type].share && (row.payMethod === 'sbp' || row.payMethod === 'card')

app.get('/campaigns', c => c.json(db.listCampaigns(c.var.cid).map(r => show(c.var.cid, r))))
app.post('/campaigns', async c => {
  const { type } = await c.req.json<{ type: OfferType }>()
  if (!(type in OFFER_TYPES)) return fail(c, 400, 'неизвестный тип оффера')
  return c.json(show(c.var.cid, db.newCampaign(c.var.cid, type)))
})
app.get('/campaigns/:id', c => {
  const row = find(c)
  return row ? c.json(show(c.var.cid, row)) : fail(c, 404, 'кампания не найдена')
})
app.patch('/campaigns/:id', async c => {
  let row = find(c)
  if (!row) return fail(c, 404, 'кампания не найдена')
  const p = await c.req.json<S['CampaignPatch']>()
  if (p.type && p.type !== row.type && p.type in OFFER_TYPES) row = { ...row, type: p.type, terms: { ...DEFAULT_TERMS[p.type] }, adText: null }
  if (p.goal) row = { ...row, goal: p.goal, adText: null }
  // текст по умолчанию собран из условий, поэтому правка условий его сбрасывает; способ подтверждения в текст не входит
  if (p.terms) row = { ...row, terms: { ...row.terms, ...p.terms }, adText: Object.keys(p.terms).every(k => k === 'via') ? row.adText : null }
  if (p.adText !== undefined) {
    row = { ...row, adText: p.adText }
    if (row.status === 'moderation') row.submittedAt = new Date().toISOString() // исправленный текст — на повторную проверку
  }
  if (p.budget !== undefined) row.budget = Math.max(3000, Math.round(p.budget))
  if (p.landingUrl !== undefined) {
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/.test(p.landingUrl)) return fail(c, 400, 'адрес должен начинаться с https:// и вести на сайт')
    row.landingUrl = p.landingUrl
  }
  if (p.paused !== undefined && launched(row)) row.status = p.paused ? 'paused' : 'live'
  for (const k of ['mode', 'img', 'audience', 'places', 'wideCard', 'amount', 'payMethod'] as const) if (p[k] !== undefined) (row as Record<string, unknown>)[k] = p[k]
  return c.json(show(c.var.cid, db.saveCampaign(c.var.cid, row)))
})

app.post('/campaigns/:id/submit', async c => {
  const cid = c.var.cid, row = find(c)
  if (!row) return fail(c, 404, 'кампания не найдена')
  if (!['draft', 'approval'].includes(row.status)) return fail(c, 409, 'кампания уже отправлена')
  const T = OFFER_TYPES[row.type], v = show(cid, row)
  if (row.mode === 'manual' && v.forecast.audienceEmpty) return fail(c, 400, 'добавьте хотя бы один сигнал')
  if (T.fields.some(f => f.num && !(+row.terms[f.k] > 0))) return fail(c, 400, 'заполните условия оффера')
  if (!T.share && row.amount !== null && row.amount < 3000) return fail(c, 400, 'сумма от 3 000 ₽')
  const session = db.getSession(cid)
  if (!session.provider || session.provider === 'inn') return fail(c, 409, 'войдите по бизнес-ID, чтобы принять оферту')
  if (session.role === 'staff') {
    const saved = db.saveCampaign(cid, { ...row, status: 'approval', approved: false, approvalToken: row.approvalToken ?? randomUUID().slice(0, 8) })
    return c.json(show(cid, saved))
  }
  if (!(await c.req.json<{ acceptOffer?: boolean }>()).acceptOffer) return fail(c, 400, 'примите оферту')
  db.patchCompany(cid, { offerAcceptedAt: new Date().toISOString() })
  return c.json(show(cid, db.saveCampaign(cid, launch(cid, row))))
})
app.post('/campaigns/:id/invoice-paid', c => {
  const row = find(c)
  if (!row || row.status !== 'invoice') return fail(c, 409, 'счёт не ждёт оплаты')
  return c.json(show(c.var.cid, db.saveCampaign(c.var.cid, launch(c.var.cid, row))))
})
app.get('/campaigns/:id/stats', c => {
  const row = find(c)
  if (!row || !launched(row)) return fail(c, 409, 'статистика появится после запуска')
  return c.json(stats(row, db.getSession(c.var.cid).clock, db.activePoints(c.var.cid)))
})
app.post('/campaigns/:id/tips/:tipId', c => {
  const row = find(c)
  if (!row) return fail(c, 404, 'кампания не найдена')
  const tip = c.req.param('tipId')
  return c.json(show(c.var.cid, db.saveCampaign(c.var.cid, { ...row, tips: [...new Set([...row.tips, tip])] })))
})
app.post('/special-requests', async c => {
  const body = await c.req.json<{ kind: string; task: string; budget: string }>()
  if (String(body.task ?? '').trim().length < 10) return fail(c, 400, 'опишите задачу хотя бы парой слов')
  return c.json({ id: db.addRequest(c.var.cid, body) })
})

/* ───────── подтверждение руководителем по ссылке ───────── */
function approval(token: string): S['Approval'] | null {
  const found = db.byToken(token)
  if (!found) return null
  const { companyId, c: row } = found, co = db.getCompany(companyId)
  return { company: co.name, signerShort: co.signerShort, employee: co.employee, campaign: show(companyId, row), approved: row.approved, needsPay: row.approved && row.status === 'approval' && needsPay(row) }
}
app.get('/approvals/:token', c => {
  const a = approval(c.req.param('token'))
  return a ? c.json(a) : fail(c, 404, 'ссылка не найдена')
})
app.post('/approvals/:token/confirm', c => {
  const found = db.byToken(c.req.param('token'))
  if (!found) return fail(c, 404, 'ссылка не найдена')
  const { companyId, c: row } = found
  if (row.status !== 'approval') return c.json(approval(c.req.param('token'))!)
  db.patchCompany(companyId, { offerAcceptedAt: new Date().toISOString() })
  db.saveCampaign(companyId, needsPay(row) ? { ...row, approved: true } : launch(companyId, { ...row, approved: true }))
  return c.json(approval(c.req.param('token'))!)
})
app.post('/approvals/:token/pay', c => {
  const found = db.byToken(c.req.param('token'))
  if (!found || !found.c.approved || found.c.status !== 'approval') return fail(c, 409, 'сначала подтвердите оферту')
  db.saveCampaign(found.companyId, launch(found.companyId, found.c))
  return c.json(approval(c.req.param('token'))!)
})

/* ───────── отслеживание ───────── */
// Демо: после запуска у купона уже есть погашения, у подписки — платежи, у заявки — заявки из формы, ждущие проверки
function seedConversions(cid: string, row: CampaignRow) {
  if (row.type === 'click' || row.type === 'promo') return
  const n = { coupon: 3, lead: 3, sub: 2 }[row.type]
  for (let i = 0; i < n; i++) addResult(cid, row, newClickId(row.id), { coupon: 'cabinet', lead: 'form', sub: 'billing' }[row.type] as S['Conversion']['source'], null)
}
// Результат, который билайн видит сам: заявка из своей формы, купон и подписка — платёж со счёта
function addResult(cid: string, row: CampaignRow, clickId: string, source: S['Conversion']['source'], note: string | null) {
  const type = row.type as 'coupon' | 'lead' | 'sub', days = DISPUTE_DAYS[type]
  return db.addConversion(cid, {
    campaignId: row.id, clickId, orderId: null, kind: KIND[type], amount: type === 'lead' ? null : +row.terms.price || 0,
    status: days ? 'pending' : 'approved', source, note, disputeUntil: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
  })
}

type Event = { clickId: string; orderId?: string | null; status?: string | null; amount?: number | null; source: 'postback' | 'csv'; note?: string }
const STATUSES = ['pending', 'approved', 'rejected', 'returned']
// Один разбор для /postback и строк CSV. Повтор order_id меняет статус, а не создаёт новую конверсию
function receive(cid: string, e: Event): { conv: S['Conversion']; created: boolean } | { error: string; code: 400 | 404 | 409 } {
  const row = db.getCampaign(cid, clickCampaign(e.clickId))
  if (!row) return { error: 'click_id не из ваших кампаний', code: 404 }
  if (row.type === 'click') return { error: 'у рекламы с оплатой за переход партнёр результат не присылает', code: 400 }
  if (e.status && !STATUSES.includes(e.status)) return { error: `статус: ${STATUSES.join(', ')}`, code: 400 }
  if (e.amount != null && !(e.amount >= 0)) return { error: 'сумма — число', code: 400 }
  const old = e.orderId ? db.conversionByOrder(cid, e.orderId) : undefined
  if (old) {
    if (!e.status || e.status === old.status) return { conv: named(cid, old), created: false }
    const ok = (old.status === 'pending' && e.status !== 'pending') || (old.status === 'approved' && e.status === 'returned')
    if (!ok) return { error: `заказ ${e.orderId}: из «${old.status}» в «${e.status}» нельзя`, code: 409 }
    return { conv: named(cid, db.setConversion(cid, old.id, e.status, null)), created: false }
  }
  if (e.status === 'returned' || e.status === 'rejected') return { error: 'возврат или отказ — только для уже присланного order_id', code: 409 }
  const days = DISPUTE_DAYS[row.type], status = e.status ?? (days ? 'pending' : 'approved')
  const conv = db.addConversion(cid, {
    campaignId: row.id, clickId: e.clickId, orderId: e.orderId ?? null, kind: KIND[row.type], amount: e.amount ?? null, status: status as S['ConversionStatus'],
    source: e.source, note: e.note ?? null, disputeUntil: status === 'pending' && days ? new Date(Date.now() + days * 864e5).toISOString() : null,
  })
  return { conv: named(cid, conv), created: true }
}
const named = (cid: string, r: db.ConversionRow): S['Conversion'] => {
  const row = db.getCampaign(cid, r.campaignId)
  return { ...r, campaignName: row ? deal(row).name : '—' }
}

function trackingView(c: Context<Env>): S['Tracking'] {
  const t = db.tracking(c.var.cid), host = c.req.header('host') ?? '127.0.0.1:8787'
  const origin = `${/^(127\.|localhost)/.test(host) ? 'http' : 'https'}://${host}`
  return {
    postbackUrl: `${origin}/api/postback?key=${t.key}&click_id={click_id}&order_id={order_id}&status={status}&amount={amount}`,
    key: t.key, connected: t.events > 0, lastEventAt: t.last_event_at, events: t.events,
    disputeDays: DISPUTE_DAYS as Record<string, number>,
  }
}
/* ───────── витрина «лучшее рядом» ───────── */
app.post('/showcase/ask', async c => {
  const body = await c.req.json().catch(() => null)
  const bad = checkAsk(body)
  if (bad) return fail(c, 400, bad)
  if (!allow(c.var.cid)) return fail(c, 429, 'слишком много вопросов подряд — подожди пару минут')
  return c.json(await ask(body))
})
app.post('/showcase/:id/act', c => {
  const row = find(c)
  if (!row) return fail(c, 404, 'кампания не найдена')
  if (show(c.var.cid, row).status !== 'live' || !row.places.showcase) return fail(c, 409, 'кампания сейчас не показывается на витрине')
  const clickId = newClickId(row.id), url = trackingUrl(row).replace('{click_id}', clickId)
  if (row.type === 'click' || row.type === 'promo') return c.json({ clickId, url, conversion: null })
  const conv = addResult(c.var.cid, row, clickId, row.type === 'lead' ? 'form' : 'billing', 'с витрины «лучшее рядом»')
  return c.json({ clickId, url, conversion: named(c.var.cid, conv) })
})

app.get('/tracking', c => c.json(trackingView(c)))
app.post('/tracking/test', c => {
  const row = db.listCampaigns(c.var.cid).find(r => r.type !== 'click')
  if (!row) return fail(c, 409, 'создайте кампанию с купоном, заявкой, промокодом или подпиской')
  const r = receive(c.var.cid, { clickId: newClickId(row.id), orderId: `test-${Date.now()}`, amount: row.type === 'promo' ? +row.terms.check || null : null, source: 'postback', note: 'тестовое событие' })
  if ('error' in r) return fail(c, r.code, r.error)
  db.trackingEvent(c.var.cid)
  return c.json(trackingView(c))
})
app.get('/postback', c => {
  const q = c.req.query(), cid = db.companyByKey(q.key ?? '')
  if (!cid) return fail(c, 401, 'неверный ключ')
  if (!q.click_id) return fail(c, 400, 'нужен click_id')
  const r = receive(cid, { clickId: q.click_id, orderId: q.order_id || null, status: q.status || null, amount: q.amount ? +q.amount : null, source: 'postback' })
  if ('error' in r) return fail(c, r.code, r.error)
  db.trackingEvent(cid)
  return c.json(r.conv)
})
app.get('/conversions', c => {
  const campaignId = c.req.query('campaignId')
  return c.json(db.listConversions(c.var.cid, campaignId ? +campaignId : undefined).map(r => named(c.var.cid, r)))
})
app.patch('/conversions/:conversionId', async c => {
  const conv = db.getConversion(c.var.cid, +c.req.param('conversionId'))
  if (!conv) return fail(c, 404, 'конверсия не найдена')
  const { status, note } = await c.req.json<{ status: string; note?: string }>()
  if (status !== 'approved' && status !== 'rejected') return fail(c, 400, 'статус: approved или rejected')
  if (conv.status !== 'pending' || !conv.disputeUntil || Date.parse(conv.disputeUntil) < Date.now()) return fail(c, 409, 'срок на спор прошёл или решение уже принято')
  return c.json(named(c.var.cid, db.setConversion(c.var.cid, conv.id, status, note?.trim() || null)))
})
app.post('/conversions/import', async c => {
  const lines = (await c.req.text()).split(/\r?\n/)
  const out = { created: 0, updated: 0, errors: [] as { line: number; message: string }[] }
  lines.forEach((text, i) => {
    const cells = text.split(/[;,]/).map(x => x.trim())
    if (!cells[0] || (i === 0 && cells[0] === 'click_id')) return
    const [clickId, orderId, status, amount] = cells
    const r = receive(c.var.cid, { clickId, orderId: orderId || null, status: status || null, amount: amount ? +amount.replace(/\s/g, '') : null, source: 'csv' })
    if ('error' in r) out.errors.push({ line: i + 1, message: r.error })
    else if (r.created) out.created++
    else out.updated++
  })
  if (out.created + out.updated) db.trackingEvent(c.var.cid, out.created + out.updated)
  return c.json(out)
})

/* ───────── деньги и документы ───────── */
const day = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? 'сегодня' : new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }))
function balance(cid: string): S['Balance'] {
  const { clock } = db.getSession(cid), rows = db.listCampaigns(cid), ap = db.activePoints(cid)
  const ops = db.listOperations(cid).map(o => ({ date: day(o.created), title: o.title, amount: o.amount }))
  const charges = rows.filter(r => spent(r, clock) > 0).map(r => ({ date: 'сегодня', title: `списано: ${view(r, ap, clock).name}`, amount: -spent(r, clock) }))
  const total = [...ops, ...charges].reduce((a, o) => a + o.amount, 0)
  const daily = rows.filter(r => r.status !== 'paused' && launched(r) && !OFFER_TYPES[r.type].share).reduce((a, r) => a + r.budget / 30, 0)
  const daysLeft = daily ? Math.max(0, Math.round(total / daily)) : null
  const shares = rows.filter(r => OFFER_TYPES[r.type].share && launched(r))
  const pays = shares.map(r => ({ r, p: payout(r, clock, ap) }))
  const due = pays.reduce((a, x) => a + x.p.due, 0)
  const gross = Math.round(pays.reduce((a, x) => a + x.p.due / (1 - OFFER_TYPES[x.r.type].fee / 100), 0))
  const types = [...new Set(shares.map(r => r.type))]
  return {
    balance: Math.max(0, total), daysLeft, low: daysLeft !== null && daysLeft < 3, autoTopup: db.getCompany(cid).autoTopup,
    operations: [...charges, ...ops],
    payout: shares.length ? { due, date: '1 декабря', gross, fee: gross - due, count: pays.reduce((a, x) => a + x.p.count, 0), unit: types.length === 1 ? OFFER_TYPES[types[0]].unit : 'купоны и подписки' } : null,
  }
}
app.get('/balance', c => c.json(balance(c.var.cid)))
app.post('/balance/topups', async c => {
  const { amount } = await c.req.json<{ amount: number }>()
  if (!(amount >= 1000)) return fail(c, 400, 'сумма от 1 000 ₽')
  db.addOperation(c.var.cid, 'пополнение, СБП', amount)
  return c.json(balance(c.var.cid))
})
app.get('/documents', c => {
  const co = db.getCompany(c.var.cid), rows = db.listCampaigns(c.var.cid), edo = co.edo ? 'придёт в ЭДО' : 'нужен ЭДО'
  const docs: S['Document'][] = [{ id: 'offer', title: 'оферта', date: co.offerAcceptedAt ? day(co.offerAcceptedAt) : '—', status: co.offerAcceptedAt ? 'принята' : 'не принята' }]
  for (const r of rows) if (r.payMethod === 'invoice' && !OFFER_TYPES[r.type].share && r.status !== 'draft' && r.status !== 'approval')
    docs.push({ id: `invoice-${r.id}`, title: `счёт-оферта № ${1040 + r.id}`, date: 'сегодня', status: r.status === 'invoice' ? 'ждём оплату' : 'оплачен' })
  if (rows.some(r => OFFER_TYPES[r.type].share && launched(r))) docs.push({ id: 'agent-11', title: 'отчёт агента за ноябрь', date: '1 декабря', status: edo })
  docs.push({ id: 'act-11', title: 'акт за ноябрь', date: '1 декабря', status: edo }, { id: 'sf-11', title: 'счёт-фактура за ноябрь', date: '1 декабря', status: edo })
  return c.json(docs)
})

app.notFound(c => fail(c, 404, 'нет такого запроса'))
app.onError((e, c) => (console.error(e), c.json({ message: 'ошибка сервера' }, 500)))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.env.API_PORT ?? 8787)
  const hostname = process.env.API_HOST ?? '127.0.0.1'
  const server = serve({ fetch: app.fetch, port, hostname }, () => console.log(`API ${CO.brand}: http://${hostname}:${port}/api`))
  const shutdown = () => {
    server.close(() => { db.db.close(); process.exit(0) })
    setTimeout(() => { if ('closeAllConnections' in server) server.closeAllConnections() }, 8000).unref()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

