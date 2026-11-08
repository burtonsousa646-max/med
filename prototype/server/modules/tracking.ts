// Отслеживание: маяк показа, клик с click_id, действие в приложении билайна, результаты партнёра (постбэк, CSV, кабинет), спор.
// Оплачиваемый клик — по правилам «Триггеров», 5.4: повтор того же абонента по той же кампании за 24 ч бесплатный,
// клик быстрее 0,5 с после выдачи не считается, антифрод (порт adtech) отсекает ботов. Деньги списывает воркер (settlement.ts).
import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { every } from '../schedule.ts'
import { enqueue } from '../integrations/outbox.ts'
import { fail, partner, sha256, type Env } from './identity.ts'
import { setting } from './partners.ts'
import { noteImpression, openTicket } from './serving.ts'

const PUBLIC_URL = () => process.env.PUBLIC_URL ?? 'http://127.0.0.1:8788'
const TICKET_TTL_MS = 24 * 3600_000
const MIN_CLICK_DELAY_MS = 500
const FRAUD_SCORE = 0.9
const KIND: Record<string, 'lead' | 'order' | 'redeem' | 'renewal'> = { lead: 'lead', promo: 'order', coupon: 'redeem', sub: 'renewal' }
const newClickId = () => 'bl' + randomBytes(12).toString('base64url')

function ticketOf(token: string) {
  const t = openTicket(token)
  if (!t || Date.now() - t.t > TICKET_TTL_MS) fail(404, 'ссылка устарела')
  return t!
}

/* ───────── показ и клик ───────── */

export const trackingPublic = new Hono()

// Маяк показа: поверхность зовёт его, когда карточка реально видна. Повтор того же показа не пишется.
trackingPublic.post('/i/:token', async c => {
  const t = ticketOf(c.req.param('token'))
  const [row] = await sql`insert into impressions (id, campaign_id, creative_id, placement, med_id, price_kop)
                          select ${t.i}, ${t.c}, ${t.cr}, ${t.p}, ${t.m}, ${t.k}
                          where not exists (select 1 from impressions where id = ${t.i}) returning id`
  if (row) noteImpression(t.m, t.c)
  return c.body(null, 204)
})

/** Записать клик. Возвращает click_id и куда вести абонента. */
export async function recordClick(token: string, meta: { ip?: string; userAgent?: string }) {
  const t = ticketOf(token)
  const [cm] = await sql`select id, company_id, type, landing_url from campaigns where id = ${t.c}`
  if (!cm) fail(404, 'нет такой кампании')
  const clickId = newClickId()
  const fraud = await port('adtech').fraudScore({ clickId, medId: t.m ?? undefined, ip: meta.ip, userAgent: meta.userAgent, placement: t.p })
  const [repeat] = t.m ? await sql`select 1 from clicks where campaign_id = ${t.c} and med_id = ${t.m} and billable and created_at > now() - interval '24 hours' limit 1` : []
  const reason = fraud.score >= FRAUD_SCORE ? 'fraud' : Date.now() - t.t < MIN_CLICK_DELAY_MS ? 'tooFast' : repeat ? 'repeat24h' : null
  // за клик платит только «переход»; у остальных типов оплата за результат
  const cost = !reason && cm.type === 'click' ? t.k : 0
  await sql`insert into clicks (click_id, impression_id, campaign_id, company_id, placement, med_id, cost_kop, billable, reason)
            values (${clickId}, ${t.i}, ${t.c}, ${cm.company_id}, ${t.p}, ${t.m}, ${cost}, ${!reason}, ${reason})`
  const url = cm.landing_url ? (cm.landing_url as string) + (cm.landing_url.includes('?') ? '&' : '?') + new URLSearchParams({ utm_source: 'beeline', utm_medium: cm.type, utm_campaign: String(cm.id), click_id: clickId }) : null
  return { clickId, url, billable: !reason, reason }
}

// Клик: редирект на сайт партнёра с click_id. ?format=json — для приложения: вернуть click_id и адрес, без редиректа.
trackingPublic.get('/c/:token', async c => {
  const r = await recordClick(c.req.param('token'), { ip: c.req.header('x-forwarded-for')?.split(',')[0].trim(), userAgent: c.req.header('user-agent') })
  if (c.req.query('format') === 'json' || !r.url) return c.json({ clickId: r.clickId, url: r.url })
  return c.redirect(r.url)
})

// Действие внутри приложения билайна после клика: купить купон или подписку со счёта телефона, оставить заявку в форме.
trackingPublic.post('/act/:clickId', async c => {
  const [cl] = await sql`select c.click_id, c.campaign_id, c.company_id, c.med_id, cm.type, cm.terms from clicks c join campaigns cm on cm.id = c.campaign_id
                         where c.click_id = ${c.req.param('clickId')} and c.created_at > now() - interval '24 hours'`
  if (!cl) fail(404, 'клик не найден или устарел')
  if (cl.type === 'click' || cl.type === 'promo') fail(422, 'у этого оффера результат на сайте партнёра')
  const b = await c.req.json<{ name?: string; phone?: string }>().catch(() => ({}) as { name?: string; phone?: string })
  if (cl.type === 'lead') {
    if (!b.phone || !/^\+?\d[\d\s()-]{9,}$/.test(b.phone)) fail(422, 'укажите телефон')
    const conv = await addConversion(cl as ClickRef, { orderId: `form:${cl.click_id}`, status: 'pending', source: 'form', amountKop: null })
    // заявку с контактами — сразу партнёру, в его CRM (если подключена) или письмом
    await enqueue(sql, 'messaging', 'company', { companyId: cl.company_id, template: 'new_lead', params: { name: String(b.name ?? ''), phone: b.phone!, campaignId: String(cl.campaign_id) } }, `notify:lead:${cl.click_id}`)
    return c.json({ ok: true, conversionId: Number(conv.id) })
  }
  // купон и подписка: платит абонент со счёта телефона, билайн видит оплату сам — результат засчитан сразу
  if (!cl.med_id) fail(422, 'оплата со счёта телефона — только для абонентов билайна')
  const priceKop = BigInt(Math.round((+cl.terms.price || 0) * 100))
  const pay = await port('subscriberBilling').charge({ medId: cl.med_id, amountKop: Number(priceKop), purpose: `оффер ${cl.campaign_id}`, idempotencyKey: `act:${cl.click_id}` })
  if (pay.status !== 'ok') fail(422, 'оплата со счёта не прошла')
  const conv = await addConversion(cl as ClickRef, { orderId: `bill:${pay.externalId}`, status: 'approved', source: 'billing', amountKop: priceKop })
  return c.json({ ok: true, conversionId: Number(conv.id) })
})

/* ───────── результаты ───────── */

type Status = 'pending' | 'approved' | 'rejected' | 'returned'
const STATUSES: Status[] = ['pending', 'approved', 'rejected', 'returned']

// Переходы: ждёт → засчитана / отклонена; засчитана → возврат. Остальное — ошибка партнёра, а не новое состояние.
const ALLOWED: Record<Status, Status[]> = { pending: ['pending', 'approved', 'rejected'], approved: ['approved', 'returned'], rejected: ['rejected'], returned: ['returned'] }

/** Новый результат или смена статуса по тому же order_id. Повтор того же события ничего не меняет. */
type ClickRef = { click_id: string; campaign_id: unknown; company_id: string; type: string }
async function addConversion(cl: ClickRef, p: { orderId: string; status: Status; source: string; amountKop: bigint | null; note?: string }, db: typeof sql | Tx = sql) {
  const days = (await setting<Record<string, number>>('dispute_days'))[cl.type]
  const [row] = await db`
    insert into conversions (company_id, campaign_id, click_id, order_id, kind, amount_kop, status, source, note, dispute_until)
    values (${cl.company_id}, ${cl.campaign_id as number}, ${cl.click_id}, ${p.orderId}, ${KIND[cl.type]}, ${p.amountKop}, ${p.status}, ${p.source}, ${p.note ?? null},
            ${p.status === 'pending' && days ? db`now() + ${days + ' days'}::interval` : null})
    on conflict (company_id, order_id) do nothing returning id, status`
  if (row) return { id: row.id, created: true }
  const [old] = await db`select id, status from conversions where company_id = ${cl.company_id} and order_id = ${p.orderId}`
  if (old.status !== p.status) {
    if (!ALLOWED[old.status as Status].includes(p.status)) fail(422, `нельзя перевести из ${old.status} в ${p.status}`)
    await db`update conversions set status = ${p.status}, amount_kop = coalesce(${p.amountKop}, amount_kop), note = coalesce(${p.note ?? null}, note), updated_at = now() where id = ${old.id}`
  }
  return { id: old.id, created: false }
}

/** Результат от партнёра по click_id: постбэк и CSV. Ключ определяет компанию; click_id должен быть её. */
async function partnerResult(companyId: string, r: { clickId: string; orderId: string; status: string; amount?: string }, source: 'postback' | 'csv') {
  if (!r.clickId || !r.orderId) fail(422, 'нужны click_id и order_id')
  if (!STATUSES.includes(r.status as Status)) fail(422, 'status: pending, approved, rejected или returned')
  const [cl] = await sql`select c.click_id, c.campaign_id, c.company_id, cm.type from clicks c join campaigns cm on cm.id = c.campaign_id
                         where c.click_id = ${r.clickId} and c.company_id = ${companyId}`
  if (!cl) fail(404, `click_id ${r.clickId} не найден у вашей компании`)
  if (!['lead', 'promo'].includes(cl.type)) fail(422, 'результаты присылают для заявок и промокодов')
  const amount = r.amount ? Math.round(Number(String(r.amount).replace(',', '.')) * 100) : NaN
  if (cl.type === 'promo' && !(amount > 0)) fail(422, 'для заказа нужна сумма amount в рублях')
  const res = await addConversion(cl as ClickRef, { orderId: r.orderId, status: r.status as Status, source, amountKop: amount > 0 ? BigInt(amount) : null })
  await sql`update tracking_keys set last_used_at = now() where company_id = ${companyId} and revoked_at is null`
  return res
}

async function companyByKey(key: string | undefined) {
  if (!key) fail(401, 'нужен key')
  const [k] = await sql`select company_id from tracking_keys where key_hash = ${sha256(key!)} and revoked_at is null`
  if (!k) fail(401, 'неверный или отозванный ключ')
  return k.company_id as string
}

// Постбэк с сервера партнёра. Ключ в адресе — вызывать только с сервера, не из браузера.
trackingPublic.get('/postback', async c => {
  const q = c.req.query()
  const companyId = await companyByKey(q.key)
  const r = await partnerResult(companyId, { clickId: q.click_id, orderId: q.order_id, status: q.status ?? 'pending', amount: q.amount }, 'postback')
  return c.json({ ok: true, conversionId: Number(r.id), created: r.created })
})

// Не оспоренные к сроку засчитываются сами
every(600_000, 'conversions.autoApprove', async () => {
  await sql`update conversions set status = 'approved', note = coalesce(note, 'засчитано по сроку'), updated_at = now()
            where status = 'pending' and dispute_until < now()`
})

/* ───────── кабинет ───────── */

const convView = (v: any) => ({
  id: Number(v.id), campaignId: Number(v.campaign_id), campaignName: v.campaign_name, clickId: v.click_id, orderId: v.order_id, kind: v.kind,
  amountKop: v.amount_kop === null ? null : String(v.amount_kop), costKop: String(v.cost_kop), status: v.status, source: v.source, note: v.note,
  disputeUntil: v.dispute_until, createdAt: v.created_at,
})

export const trackingCabinet = new Hono<Env>()

trackingCabinet.get('/conversions', async c => {
  const { campaignId, status } = c.req.query()
  const rows = await sql`select v.*, cm.name as campaign_name from conversions v join campaigns cm on cm.id = v.campaign_id
                         where v.company_id = ${c.var.partner.companyId}
                           ${campaignId ? sql`and v.campaign_id = ${campaignId}` : sql``}
                           ${status ? sql`and v.status = ${status}` : sql``}
                         order by v.created_at desc limit 500`
  return c.json(rows.map(convView))
})

trackingCabinet.patch('/conversions/:id', partner('owner', 'staff', 'agency'), async c => {
  const b = await c.req.json<{ status: Status; note?: string }>()
  if (!['approved', 'rejected', 'returned'].includes(b.status)) fail(422, 'status: approved, rejected или returned')
  const [v] = await sql`select v.*, cm.type from conversions v join campaigns cm on cm.id = v.campaign_id where v.id = ${c.req.param('id')} and v.company_id = ${c.var.partner.companyId}`
  if (!v) fail(404, 'нет такого результата')
  if (v.source === 'billing') fail(422, 'оплату со счёта телефона билайн подтверждает сам')
  if (b.status === 'rejected' && v.dispute_until && new Date(v.dispute_until) < new Date()) fail(422, 'срок на спор прошёл')
  await addConversion({ click_id: v.click_id, campaign_id: v.campaign_id, company_id: v.company_id, type: v.type }, { orderId: v.order_id, status: b.status, source: v.source, amountKop: null, note: b.note })
  const [row] = await sql`select v.*, cm.name as campaign_name from conversions v join campaigns cm on cm.id = v.campaign_id where v.id = ${v.id}`
  return c.json(convView(row))
})

// CSV из CRM или 1С: click_id;order_id;status;amount. Первая строка может быть заголовком. Ошибки строк не останавливают загрузку.
trackingCabinet.post('/conversions/import', partner('owner', 'staff', 'agency'), async c => {
  const text = await c.req.text()
  if (text.length > 2_000_000) fail(422, 'файл больше 2 МБ — разбейте на части')
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  let created = 0, updated = 0
  const errors: { line: number; message: string }[] = []
  for (const [i, line] of lines.entries()) {
    const [clickId, orderId, status = 'pending', amount] = line.split(/[;,\t]/).map(x => x.trim().replace(/^"|"$/g, ''))
    if (i === 0 && /click/i.test(clickId)) continue
    try {
      const r = await partnerResult(c.var.partner.companyId, { clickId, orderId, status, amount }, 'csv')
      r.created ? created++ : updated++
    } catch (e) {
      errors.push({ line: i + 1, message: (e as Error).message })
    }
  }
  return c.json({ created, updated, errors: errors.slice(0, 100) })
})

trackingCabinet.get('/tracking', async c => {
  const id = c.var.partner.companyId
  const keys = await sql`select id, hint, created_at, last_used_at from tracking_keys where company_id = ${id} and revoked_at is null order by created_at`
  const [ev] = await sql`select count(*)::int as n, max(created_at) as last from conversions where company_id = ${id} and source in ('postback', 'csv')`
  return c.json({
    postbackUrl: `${PUBLIC_URL()}/api/public/postback?key={key}&click_id={click_id}&order_id={order_id}&status={status}&amount={amount}`,
    keys: keys.map(k => ({ id: Number(k.id), hint: k.hint, createdAt: k.created_at, lastUsedAt: k.last_used_at })),
    events: ev.n, lastEventAt: ev.last, disputeDays: await setting('dispute_days'),
  })
})

// Новый ключ показываем один раз; храним только хеш. Несколько ключей — чтобы сменить ключ без простоя.
trackingCabinet.post('/tracking/keys', partner('owner'), async c => {
  const key = 'pk_' + randomBytes(24).toString('base64url')
  const [k] = await sql`insert into tracking_keys (company_id, key_hash, hint) values (${c.var.partner.companyId}, ${sha256(key)}, ${'…' + key.slice(-4)}) returning id`
  return c.json({ id: Number(k.id), key })
})

trackingCabinet.delete('/tracking/keys/:id', partner('owner'), async c => {
  const [k] = await sql`update tracking_keys set revoked_at = now() where id = ${c.req.param('id')} and company_id = ${c.var.partner.companyId} and revoked_at is null returning id`
  if (!k) fail(404, 'нет такого ключа')
  return c.json({ ok: true })
})
