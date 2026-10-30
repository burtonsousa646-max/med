// Кампании: справочник для сборки, черновик, креативы с версиями, прогноз, отправка, подтверждение руководителем, оплата.
// Путь: draft → [approval] → [invoice: ждёт оплату] → moderation → live ⇄ paused. Отклонённый текст — rejected, правка — снова moderation.
// Модерация и маркировка решают судьбу креатива (moderation.ts, marking.ts) и сообщают сюда через creativeRejected / creativeMarked.
import { Hono } from 'hono'
import { sql, type Db, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { fail, partner, sha256, token, type Env } from './identity.ts'
import { acceptOffer, setting } from './partners.ts'
import { balances, createPayment, kop, onPaid } from './billing.ts'
import { startModeration, stopHits } from './moderation.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { notify } from './notifications.ts'

const APP_URL = () => process.env.APP_URL ?? 'http://127.0.0.1:5174'
const PUBLIC_URL = () => process.env.PUBLIC_URL ?? 'http://127.0.0.1:8788'

/* ───────── справочник ───────── */

// Цели автопилота: готовый набор сигналов и мест. Выбор цели в сборке ставит их в кампанию.
const GOALS = [
  { id: 'near', t: 'привести соседей в точку', d: 'покажем тем, кто живёт и работает в километре от вас', signals: { live: 'any', work: 'any' }, placements: ['showcase', 'main', 'paid'] },
  { id: 'rivals', t: 'перехватить клиентов конкурентов', d: 'тем, кто регулярно ходит к конкурентам рядом с вами', signals: { rival: 'any' }, placements: ['showcase', 'paid'] },
  { id: 'showcase', t: 'оффер в витрине «лучшее рядом»', d: 'карточка в приложении билайна для тех, кто ищет выгоду рядом', signals: {}, placements: ['showcase'] },
]

export async function catalogView() {
  const offerTypes = await sql`select id, share, fee_pct, data from offer_types order by array_position(array['click','coupon','lead','promo','sub'], id)`
  const placements = await sql`select * from placements where active order by base_ctr desc nulls last`
  const triggers = await sql`select id, grp, name, tier, value, min_bid_kop, reach_hint from triggers where value <> 'off' order by grp, id`
  const s = Object.fromEntries((await sql`select key, value from settings`).map(r => [r.key, r.value]))
  return {
    offerTypes: offerTypes.map(o => ({ id: o.id, share: o.share, feePct: Number(o.fee_pct), ...o.data })),
    placements: placements.map(p => ({ id: p.id, surface: p.surface, name: p.name, format: p.format, pricing: p.pricing, baseCtr: p.base_ctr && Number(p.base_ctr), slots: p.slots, minBidKop: String(p.min_bid_kop), needsConsent: p.needs_consent })),
    triggers: triggers.map(t => ({ id: t.id, group: t.grp, name: t.name, tier: t.tier, value: t.value, minBidKop: String(t.min_bid_kop), reachHint: t.reach_hint })),
    payMethods: [
      { id: 'sbp', name: 'СБП для бизнеса', hint: 'зачисление за 10 секунд', largeOnly: false },
      { id: 'card', name: 'бизнес-карта', hint: 'зачисление сразу', largeOnly: false },
      { id: 'invoice', name: 'счёт-оферта', hint: 'зачисление 1–3 дня, запуск после оплаты', largeOnly: false },
      { id: 'post', name: 'постоплата', hint: `лимит ${Number(s.postpay_limit_kop) / 100} ₽, счёт в конце месяца`, largeOnly: true },
    ],
    goals: GOALS,
    settings: { firstBonusKop: String(s.first_campaign_bonus_kop), wideMarkupPct: s.wide_card_markup_pct, minBudgetMonthKop: String(s.min_budget_month_kop), offerVersion: s.offer_version },
  }
}

/* ───────── условия и тексты по типу оффера ───────── */

// Стартовые условия: партнёр меняет их в сборке
const DEFAULT_TERMS: Record<string, Record<string, string>> = {
  click: {},
  coupon: { what: 'скидка 50 % на первый визит', price: '350', old: '700', via: 'код в кабинете' },
  lead: { what: 'бесплатная консультация', price: '600', via: 'почта' },
  promo: { code: 'BEELINE15', off: '15', fee: '8', check: '1200', via: 'файл раз в неделю' },
  sub: { what: 'подписка на сервис', price: '299', trial: '7', via: 'коды доступа' },
}

type Row = Record<string, any>
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Название, строка условий, оффер для карточки, кнопка, текст объявления по умолчанию, цена результата (₽). */
export function deal(c: Row, co: { brand: string; name: string; site: string | null }, feePct: number) {
  const t = c.terms ?? {}, n = (k: string) => +t[k] || 0, who = co.brand || co.name
  switch (c.type) {
    case 'coupon': return { name: `купон: ${t.what}`, line: `${n('price')} ₽ вместо ${n('old')} ₽ · комиссия ${feePct} %`, offer: `${t.what} за ${n('price')} ₽`, cta: `купить за ${n('price')} ₽`, text: `${cap(t.what ?? '')} за ${n('price')} ₽ вместо ${n('old')} ₽. Купон в приложении билайна`, per: n('price') * (1 - feePct / 100) }
    case 'lead': return { name: `заявки: ${t.what}`, line: `${n('price')} ₽ за подтверждённую заявку`, offer: t.what, cta: 'оставить заявку', text: `${cap(t.what ?? '')} от ${who}. Оставьте заявку — перезвоним`, per: n('price') }
    case 'promo': return { name: `промокод ${t.code}`, line: `−${n('off')} % по коду ${t.code} · ${n('fee')} % с оплаченной покупки`, offer: `−${n('off')} % по промокоду`, cta: 'получить промокод', text: `−${n('off')} % на заказ${co.site ? ` на ${co.site}` : ''} по промокоду ${t.code}`, per: n('check') * n('fee') / 100 }
    case 'sub': return { name: `подписка: ${t.what}`, line: `${n('price')} ₽ в месяц, ${n('trial')} дней бесплатно · доля билайна ${feePct} %`, offer: `${n('trial')} дней бесплатно`, cta: `попробовать ${n('trial')} дней`, text: `${cap(t.what ?? '')}: ${n('trial')} дней бесплатно, потом ${n('price')} ₽ в месяц со счёта телефона`, per: n('price') * (1 - feePct / 100) }
    default: return { name: `реклама ${who}`, line: 'оплата за переход, показы бесплатно', offer: who, cta: 'перейти', text: `${who} — рядом с вами. Загляните сегодня`, per: 0 }
  }
}

/* ───────── прогноз ───────── */

// ponytail: прогноз — формула по каталогу и гео до подключения DMP; потом охват берётся из dmp.estimate, CTR — из истории аукционов
async function forecast(c: Row, share: boolean, rate: number, perRub: number) {
  const points = await sql`select lat, lon from points where company_id = ${c.company_id} and active`
  const radiusM = Number(c.targeting?.radiusM ?? 1000)
  let reach = 0
  for (const p of points) reach += (await port('geo').reach({ lat: p.lat, lon: p.lon, radiusM })).people
  const sig = (c.targeting?.signals ?? {}) as Record<string, 'any' | 'and' | 'not'>
  const ids = Object.keys(sig)
  const triggers = ids.length ? await sql`select id, reach_hint, min_bid_kop from triggers where id in ${sql(ids)}` : []
  const hint = (b: string) => triggers.filter(t => sig[t.id] === b)
  const anyHint = hint('any').reduce((s, t) => s + (t.reach_hint ?? 1000), 0)
  let shareOfPeople = hint('any').length ? Math.min(1, Math.max(0.05, anyHint / 30000)) : 1
  shareOfPeople *= 0.4 ** hint('and').length * (1 - 0.08 * hint('not').length)
  reach = Math.round(reach * shareOfPeople)

  const placements = c.placements.length ? await sql`select min_bid_kop, base_ctr from placements where id in ${sql(c.placements)}` : []
  const floor = Math.max(0, ...placements.map(p => Number(p.min_bid_kop)), ...triggers.filter(t => sig[t.id] !== 'not').map(t => Number(t.min_bid_kop)))
  const wide = c.wide_card && c.placements.includes('showcase') ? 1 + Number(await setting('wide_card_markup_pct')) / 100 : 1
  const cpcKop = Math.round(Math.max(Number(c.bid_kop ?? 0), floor * 1.5) * wide) // автоставка — полторы минимальных
  const ctr = placements.length ? placements.reduce((s, p) => s + Number(p.base_ctr ?? 0.5), 0) / placements.length / 100 : 0
  const impressions = reach * 12 // не больше 3 показов в неделю на человека
  const budget = Number(c.budget_month_kop)
  const clicks = Math.round(cpcKop ? Math.min(budget / cpcKop, impressions * ctr) : 0)
  const results = Math.round(share ? reach * rate : perRub > 0 ? budget / (perRub * 100) : clicks * 0.25)
  return { reach, impressions, clicks, cpcKop: String(cpcKop), results, perKop: String(Math.round(perRub * 100)), spendKop: String(share ? 0 : Math.min(budget, clicks * cpcKop)) }
}

/* ───────── чтение ───────── */

const trackingUrl = (c: Row) => c.landing_url
  ? `${c.landing_url}${c.landing_url.includes('?') ? '&' : '?'}utm_source=beeline&utm_medium=${c.type}&utm_campaign=${c.id}&click_id={click_id}` : null

async function load(db: Db, companyId: string, id: string | number, lock = false) {
  const [c] = lock ? await db`select * from campaigns where id = ${id} and company_id = ${companyId} for update`
    : await db`select * from campaigns where id = ${id} and company_id = ${companyId}`
  if (!c) fail(404, 'нет такой кампании')
  return c as Row
}

export async function campaignView(companyId: string, id: string | number) {
  const c = await load(sql, companyId, id)
  const [co] = await sql`select brand, name, site from companies where id = ${companyId}`
  const [ot] = await sql`select share, fee_pct, data from offer_types where id = ${c.type}`
  const [cr] = await sql`select * from creatives where campaign_id = ${c.id} order by version desc limit 1`
  const [live] = await sql`select id, version, erid from creatives where campaign_id = ${c.id} and status = 'approved' and erid is not null order by version desc limit 1`
  const [mod] = cr ? await sql`select status, reason, auto_result from moderation_tasks where creative_id = ${cr.id} order by id desc limit 1` : []
  const [appr] = await sql`select expires_at, requested_by from approvals where campaign_id = ${c.id} and confirmed_at is null and expires_at > now() order by created_at desc limit 1`
  const [pay] = await sql`select p.id, p.status, p.method, p.amount_kop, r.data->>'confirmUrl' as confirm_url from payments p
                          left join external_refs r on r.entity = 'payment' and r.entity_id = p.id::text and r.system = 'payments'
                          where p.campaign_id = ${c.id} order by p.created_at desc limit 1`
  const d = deal(c, co as never, Number(ot.fee_pct))
  // черновик: заранее показываем стоп-слова, чтобы партнёр исправил текст до отправки
  const preview = cr?.status === 'draft' ? stopHits(cr.ad_text, await sql`select pattern, why, fix from stop_words where active`) : []
  return {
    id: Number(c.id), type: c.type, status: c.status, name: c.name || d.name, mode: c.mode, goal: c.goal,
    terms: c.terms, targeting: c.targeting, placements: c.placements, wideCard: c.wide_card,
    bidKop: c.bid_kop && String(c.bid_kop), budgetMonthKop: String(c.budget_month_kop), dailyCapKop: c.daily_cap_kop && String(c.daily_cap_kop),
    payMethod: c.pay_method, landingUrl: c.landing_url, trackingUrl: trackingUrl(c),
    startsAt: c.starts_at, endsAt: c.ends_at, launchedAt: c.launched_at, createdAt: c.created_at, updatedAt: c.updated_at, version: c.version,
    creative: cr ? { id: Number(cr.id), version: cr.version, adText: cr.ad_text, imageKey: cr.image_key, imageUrl: cr.image_key && port('storage').url(cr.image_key), status: cr.status, erid: cr.erid } : null,
    liveCreative: live ? { id: Number(live.id), version: live.version, erid: live.erid } : null,
    moderation: mod ? { status: mod.status, reason: mod.reason, hits: mod.auto_result?.hits ?? [] } : preview.length ? { status: 'preview', reason: null, hits: preview } : null,
    approval: appr ? { expiresAt: appr.expires_at, requestedBy: appr.requested_by } : null,
    payment: pay ? { id: pay.id, status: pay.status, method: pay.method, amountKop: String(pay.amount_kop), confirmUrl: pay.confirm_url && (pay.confirm_url.startsWith('/') ? PUBLIC_URL() + pay.confirm_url : pay.confirm_url) } : null,
    deal: { line: d.line, offer: d.offer, cta: d.cta },
    forecast: await forecast(c, ot.share, Number(ot.data.rate ?? 0), d.per),
  }
}

/* ───────── переходы статусов ───────── */

/** На проверку: последний креатив уходит модератору. */
async function toModeration(tx: Tx, c: Row) {
  await tx`update campaigns set status = 'moderation', updated_at = now() where id = ${c.id}`
  const [cr] = await tx`update creatives set status = 'moderation' where id = (select id from creatives where campaign_id = ${c.id} order by version desc limit 1)
                        returning id`
  await startModeration(tx, cr.id, c.company_id)
}

/** Креатив отклонён: кампания на проверке становится rejected; живая продолжает показывать прошлую версию. */
export async function creativeRejected(tx: Tx, creativeId: string | number) {
  const [c] = await tx`update campaigns set status = 'rejected', updated_at = now()
                       where id = (select campaign_id from creatives where id = ${creativeId}) and status = 'moderation' returning id, company_id`
  return c
}

/** Креатив промаркирован (есть erid): кампания на проверке запускается; у живой начинает показываться новая версия. */
export async function creativeMarked(tx: Tx, creativeId: string | number) {
  const [c] = await tx`update campaigns set status = 'live', launched_at = coalesce(launched_at, now()), updated_at = now()
                       where id = (select campaign_id from creatives where id = ${creativeId}) and status = 'moderation'
                       returning id, company_id, name, (select erid from creatives where id = ${creativeId}) as erid`
  if (c) await notify(tx, c.company_id, 'campaign_live', { campaign: c.name, campaignId: String(c.id), erid: c.erid }, `live:${c.id}`)
}

// Оплата под кампанию дошла: «ждёт оплату» → проверка
onPaid.push(async (tx, p) => {
  if (!p.campaign_id) return
  const [c] = await tx`select * from campaigns where id = ${p.campaign_id} and status = 'invoice' for update`
  if (c) await toModeration(tx, c)
})

type LaunchBody = { acceptOffer?: boolean; payMethod?: string; idempotencyKey?: string }

/** Запуск подписантом: оферта, затем деньги. Возвращает платёж, если нужно доплатить. */
async function launch(companyId: string, id: string | number, userId: string, b: LaunchBody) {
  const c = await load(sql, companyId, id)
  const [co] = await sql`select segment, kyc_status, offer_version from companies where id = ${companyId}`
  const [ot] = await sql`select share from offer_types where id = ${c.type}`
  const method = b.payMethod ?? c.pay_method ?? 'sbp'
  if (!['sbp', 'card', 'invoice', 'post'].includes(method)) fail(422, 'неизвестный способ оплаты')
  if (method === 'post' && co.segment !== 'large') fail(422, 'постоплата — только для крупного бизнеса')
  const current = await setting<string>('offer_version')
  if (co.offer_version !== current && !b.acceptOffer) fail(422, 'чтобы запустить, примите оферту')

  // сколько не хватает на месячный бюджет; купон и подписка не требуют денег — платит абонент
  const { availableKop } = await balances(sql, companyId)
  const need = ot.share || method === 'post' ? 0n : kop(c.budget_month_kop) - availableKop
  const min = kop(await setting('min_topup_kop'))
  if (need > 0n && !b.idempotencyKey) fail(422, 'нужен idempotencyKey для оплаты')
  const payment = need > 0n
    ? await createPayment({ companyId, method: method as 'sbp', amountKop: need > min ? need : min, campaignId: c.id, key: `${companyId}:campaign:${c.id}:${b.idempotencyKey}` })
    : null

  await sql.begin(async tx => {
    const locked = await load(tx, companyId, id, true)
    if (!['draft', 'approval'].includes(locked.status)) fail(409, 'кампания уже отправлена')
    if (co.offer_version !== current) await acceptOffer(tx, companyId, userId)
    await tx`update campaigns set pay_method = ${method}, updated_at = now() where id = ${c.id}`
    await tx`update approvals set confirmed_at = now(), confirmed_by = ${userId} where campaign_id = ${c.id} and confirmed_at is null`
    if (payment && payment.payment.status !== 'succeeded') await tx`update campaigns set status = 'invoice' where id = ${c.id}`
    else await toModeration(tx, locked)
    await tx`insert into audit_log (actor_type, actor_id, company_id, action, entity, entity_id, diff)
             values ('partner', ${userId}, ${companyId}, 'campaign.launch', 'campaign', ${String(c.id)}, ${tx.json({ method, needKop: String(need) })})`
  })
  return payment
}

/* ───────── маршруты кабинета ───────── */

export const campaigns = new Hono<Env>()

campaigns.get('/catalog', async c => c.json(await catalogView()))

campaigns.get('/campaigns', async c => {
  const rows = await sql`select id, type, status, name, budget_month_kop, placements, created_at, launched_at from campaigns
                         where company_id = ${c.var.partner.companyId} and status <> 'archived' order by created_at desc`
  return c.json(rows.map(r => ({ id: Number(r.id), type: r.type, status: r.status, name: r.name, budgetMonthKop: String(r.budget_month_kop), placements: r.placements, createdAt: r.created_at, launchedAt: r.launched_at })))
})

campaigns.post('/campaigns', partner('owner', 'staff', 'agency'), async c => {
  const { type } = await c.req.json<{ type: string }>()
  const [ot] = await sql`select fee_pct from offer_types where id = ${type ?? ''}`
  if (!ot) fail(422, 'неизвестный тип оффера')
  const companyId = c.var.partner.companyId
  const [co] = await sql`select brand, name, site, segment from companies where id = ${companyId}`
  const terms = DEFAULT_TERMS[type] ?? {}
  const d = deal({ type, terms }, co as never, Number(ot.fee_pct))
  const id = await sql.begin(async tx => {
    const [cm] = await tx`insert into campaigns (company_id, type, name, mode, terms, placements, budget_month_kop, created_by, landing_url)
                          values (${companyId}, ${type}, ${d.name}, ${co.segment === 'small' ? 'auto' : co.segment === 'medium' ? 'manual' : 'plan'},
                                  ${tx.json(terms)}, ${['showcase']}, ${String(await setting('min_budget_month_kop'))}, ${c.var.partner.userId},
                                  ${co.site ? `https://${co.site.replace(/^https?:\/\//, '')}` : null})
                          returning id`
    await tx`insert into creatives (campaign_id, version, ad_text, status) values (${cm.id}, 1, ${d.text}, 'draft')`
    return cm.id
  })
  return c.json(await campaignView(companyId, id))
})

campaigns.get('/campaigns/:id', async c => c.json(await campaignView(c.var.partner.companyId, c.req.param('id'))))

// Что можно менять в каком статусе. Живую кампанию — только то, что не меняет смысл оффера; новый текст уходит на проверку.
const DRAFT_FIELDS = ['name', 'mode', 'goal', 'terms', 'targeting', 'placements', 'wideCard', 'bidKop', 'budgetMonthKop', 'dailyCapKop', 'payMethod', 'landingUrl', 'startsAt', 'endsAt', 'adText', 'imageKey']
const LIVE_FIELDS = ['name', 'placements', 'wideCard', 'bidKop', 'budgetMonthKop', 'dailyCapKop', 'endsAt', 'adText', 'imageKey', 'paused']
const COLUMNS: Record<string, string> = { name: 'name', mode: 'mode', goal: 'goal', terms: 'terms', targeting: 'targeting', placements: 'placements', wideCard: 'wide_card', bidKop: 'bid_kop', budgetMonthKop: 'budget_month_kop', dailyCapKop: 'daily_cap_kop', payMethod: 'pay_method', landingUrl: 'landing_url', startsAt: 'starts_at', endsAt: 'ends_at' }

campaigns.patch('/campaigns/:id', partner('owner', 'staff', 'agency'), async c => {
  const b = await c.req.json<Record<string, any>>()
  const companyId = c.var.partner.companyId
  await sql.begin(async tx => {
    const cm = await load(tx, companyId, c.req.param('id'), true)
    if (b.version !== undefined && b.version !== cm.version) fail(409, 'кампанию уже изменили, обновите страницу')
    const allowed = ['draft', 'rejected'].includes(cm.status) ? DRAFT_FIELDS : ['live', 'paused'].includes(cm.status) ? LIVE_FIELDS : []
    const keys = Object.keys(b).filter(k => k !== 'version')
    const denied = keys.filter(k => !allowed.includes(k))
    if (denied.length) fail(409, allowed.length ? `в этом статусе нельзя менять: ${denied.join(', ')}` : 'кампания ждёт подтверждения или проверки, менять её сейчас нельзя')
    await validate(tx, cm, b)

    const patch = Object.fromEntries(keys.filter(k => COLUMNS[k]).map(k => [COLUMNS[k], ['terms', 'targeting'].includes(k) ? tx.json(b[k]) : ['bidKop', 'budgetMonthKop', 'dailyCapKop'].includes(k) && b[k] !== null ? String(b[k]) : b[k]]))
    if (Object.keys(patch).length) await tx`update campaigns set ${tx(patch as never)}, version = version + 1, updated_at = now() where id = ${cm.id}`
    if (b.paused !== undefined) await setPaused(tx, cm, !!b.paused)
    if (b.adText !== undefined || b.imageKey !== undefined) await editCreative(tx, cm, b)
  })
  return c.json(await campaignView(companyId, c.req.param('id')))
})

async function validate(tx: Tx, cm: Row, b: Record<string, any>) {
  if (b.placements !== undefined) {
    if (!Array.isArray(b.placements) || !b.placements.length) fail(422, 'выберите хотя бы одно место показа')
    const found = await tx`select id from placements where active and id in ${tx(b.placements)}`
    if (found.length !== new Set(b.placements).size) fail(422, 'неизвестное место показа')
  }
  if (b.budgetMonthKop !== undefined && kop(b.budgetMonthKop) < kop(await setting('min_budget_month_kop'))) fail(422, `минимальный бюджет — ${Number(await setting('min_budget_month_kop')) / 100} ₽ в месяц`)
  if (b.dailyCapKop != null && kop(b.dailyCapKop) <= 0n) fail(422, 'дневной лимит должен быть больше нуля')
  if (b.bidKop != null) {
    const ids = b.placements ?? cm.placements
    const [{ m }] = await tx`select coalesce(max(min_bid_kop), 0)::text as m from placements where id in ${tx(ids)}`
    if (kop(b.bidKop) < BigInt(m)) fail(422, `ставка ниже минимальной для выбранных мест: ${Number(m) / 100} ₽`)
  }
  if (b.landingUrl != null && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(b.landingUrl)) fail(422, 'ссылка должна начинаться с https://')
  if (b.adText != null && (typeof b.adText !== 'string' || !b.adText.trim() || b.adText.length > 90)) fail(422, 'текст объявления — от 1 до 90 символов')
  if (b.terms !== undefined && (typeof b.terms !== 'object' || Array.isArray(b.terms))) fail(422, 'условия — объект')
  if (b.targeting?.signals) {
    const ids = Object.keys(b.targeting.signals)
    if (Object.values(b.targeting.signals).some(v => !['any', 'and', 'not'].includes(v as string))) fail(422, 'сигнал: any, and или not')
    const ok = ids.length ? await tx`select id from triggers where value <> 'off' and id in ${tx(ids)}` : []
    if (ok.length !== ids.length) fail(422, 'неизвестный или непродаваемый сигнал')
  }
}

async function setPaused(tx: Tx, cm: Row, paused: boolean) {
  if (!paused && cm.status === 'paused') {
    const [co] = await tx`select kyc_status from companies where id = ${cm.company_id}`
    if (co.kyc_status !== 'verified') fail(403, 'компания заблокирована или не проверена — показ недоступен')
  }
  if (paused && cm.status === 'live') await tx`update campaigns set status = 'paused', updated_at = now() where id = ${cm.id}`
  if (!paused && cm.status === 'paused') await tx`update campaigns set status = 'live', updated_at = now() where id = ${cm.id}`
}

// Черновик правится на месте. После отправки — новая версия на проверку; живая кампания показывает прошлую, пока новую не одобрят.
async function editCreative(tx: Tx, cm: Row, b: Record<string, any>) {
  const [cr] = await tx`select * from creatives where campaign_id = ${cm.id} order by version desc limit 1`
  const adText = b.adText ?? cr.ad_text, imageKey = b.imageKey !== undefined ? b.imageKey : cr.image_key
  if (cm.status === 'draft') {
    await tx`update creatives set ad_text = ${adText}, image_key = ${imageKey} where id = ${cr.id}`
    return
  }
  const [next] = await tx`insert into creatives (campaign_id, version, ad_text, image_key, status) values (${cm.id}, ${cr.version + 1}, ${adText}, ${imageKey}, 'moderation') returning id`
  if (cm.status === 'rejected') await tx`update campaigns set status = 'moderation', updated_at = now() where id = ${cm.id}`
  await startModeration(tx, next.id, cm.company_id)
}

campaigns.post('/campaigns/:id/image', partner('owner', 'staff', 'agency'), async c => {
  const companyId = c.var.partner.companyId
  const cm = await load(sql, companyId, c.req.param('id'))
  const file = (await c.req.parseBody()).file
  if (!(file instanceof File)) fail(422, 'нужен файл в поле file')
  const f = file as File
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[f.type]
  if (!ext) fail(422, 'картинка — PNG, JPEG или WebP')
  if (f.size > 2 * 1024 * 1024) fail(422, 'картинка — до 2 МБ')
  const { key } = await port('storage').put({ key: `creatives/${companyId}/${cm.id}/${token().slice(0, 16)}.${ext}`, body: new Uint8Array(await f.arrayBuffer()), contentType: f.type })
  return c.json({ imageKey: key, imageUrl: port('storage').url(key) })
})

campaigns.post('/campaigns/:id/submit', partner('owner', 'staff', 'agency'), async c => {
  const b: LaunchBody = await c.req.json<LaunchBody>().catch(() => ({}))
  const { companyId, userId, signer } = c.var.partner
  const cm = await load(sql, companyId, c.req.param('id'))
  if (cm.status !== 'draft') fail(409, 'отправить можно только черновик')
  const [co] = await sql`select kyc_status from companies where id = ${companyId}`
  if (co.kyc_status !== 'verified') fail(422, 'запуск откроется после проверки компании')
  if (!cm.placements.length) fail(422, 'выберите хотя бы одно место показа')
  if (['click', 'lead', 'promo'].includes(cm.type) && !cm.landing_url) fail(422, 'укажите, куда ведёт объявление')

  if (signer) {
    const payment = await launch(companyId, cm.id, userId, b)
    return c.json({ campaign: await campaignView(companyId, cm.id), payment, approvalUrl: null })
  }
  // не подписант: ссылка руководителю
  const t = token(), days = await setting<number>('approval_ttl_days')
  await sql.begin(async tx => {
    const locked = await load(tx, companyId, cm.id, true)
    if (locked.status !== 'draft') fail(409, 'кампания уже отправлена')
    await tx`insert into approvals (token_hash, campaign_id, requested_by, expires_at) values (${sha256(t)}, ${cm.id}, ${userId}, now() + ${days + ' days'}::interval)`
    await tx`update campaigns set status = 'approval', pay_method = coalesce(${b.payMethod ?? null}, pay_method), updated_at = now() where id = ${cm.id}`
  })
  const url = `${APP_URL()}/approve/${t}`
  const signers = await sql`select coalesce(u.email, i.data->>'email') as email from memberships m join users u on u.id = m.user_id
                            left join identities i on i.user_id = u.id where m.company_id = ${companyId} and m.signer`
  for (const s of signers.filter(s => s.email))
    await port('messaging').send({ channel: 'email', to: s.email, template: 'approval_request', params: { campaign: cm.name, url }, idempotencyKey: `appr:${sha256(t).slice(0, 16)}:${s.email}` })
  return c.json({ campaign: await campaignView(companyId, cm.id), payment: null, approvalUrl: url })
})

// Руководитель открывает ссылку: нужно войти подписантом этой же компании
async function approvalOf(c: { var: Env['Variables'] }, t: string) {
  const [a] = await sql`select a.campaign_id, a.expires_at, a.confirmed_at, cm.company_id, cm.status from approvals a join campaigns cm on cm.id = a.campaign_id
                        where a.token_hash = ${sha256(t)}`
  if (!a || a.company_id !== c.var.partner.companyId) fail(404, 'ссылка не найдена — войдите в компанию, где отправили кампанию')
  if (a.confirmed_at || a.status !== 'approval') fail(409, 'кампания уже подтверждена')
  if (new Date(a.expires_at) < new Date()) fail(410, 'ссылка устарела, попросите отправить заново')
  if (!c.var.partner.signer) fail(403, 'подтверждает подписант компании')
  return a
}

campaigns.get('/approvals/:token', async c => {
  const a = await approvalOf(c, c.req.param('token'))
  return c.json(await campaignView(c.var.partner.companyId, a.campaign_id))
})

campaigns.post('/approvals/:token/confirm', async c => {
  const a = await approvalOf(c, c.req.param('token'))
  const b: LaunchBody = await c.req.json<LaunchBody>().catch(() => ({}))
  const payment = await launch(c.var.partner.companyId, a.campaign_id, c.var.partner.userId, b)
  return c.json({ campaign: await campaignView(c.var.partner.companyId, a.campaign_id), payment, approvalUrl: null })
})

// Спецпроект с менеджером: заявка в Service desk билайна
campaigns.post('/special-requests', partner('owner', 'staff', 'agency'), async c => {
  const b = await c.req.json<{ kind: string; task: string; budget: string }>()
  if (!['game', 'section', 'raffle', 'segment'].includes(b.kind)) fail(422, 'вид спецпроекта: game, section, raffle, segment')
  if (String(b.task ?? '').trim().length < 10) fail(422, 'опишите задачу хотя бы парой слов')
  const companyId = c.var.partner.companyId
  const id = await sql.begin(async tx => {
    const [r] = await tx`insert into special_requests (company_id, data) values (${companyId}, ${tx.json({ kind: b.kind, task: b.task.trim(), budget: String(b.budget ?? ''), userId: c.var.partner.userId })}) returning id`
    await enqueue(tx, 'support', 'specialRequest', { requestId: r.id }, `special:${r.id}`)
    return r.id
  })
  return c.json({ ok: true, id: Number(id) })
})

handle('support', 'specialRequest', async ({ requestId }: { requestId: string }) => {
  const [r] = await sql`select r.data, c.id as company_id, c.name, c.inn, c.phone from special_requests r join companies c on c.id = r.company_id where r.id = ${requestId}`
  const { externalId } = await port('support').createTicket({ companyId: r.company_id, topic: `спецпроект: ${r.data.kind}`, text: `${r.data.task}\nбюджет: ${r.data.budget}\n${r.name}, ИНН ${r.inn}`, contact: r.phone ?? '' })
  await sql`insert into external_refs (entity, entity_id, system, external_id) values ('special_request', ${String(requestId)}, 'support', ${externalId}) on conflict do nothing`
})

campaigns.post('/campaigns/:id/archive', partner('owner', 'staff', 'agency'), async c => {
  const cm = await load(sql, c.var.partner.companyId, c.req.param('id'))
  if (!['draft', 'rejected', 'paused', 'finished'].includes(cm.status)) fail(409, 'в архив — черновик, отклонённую, на паузе или завершённую')
  await sql`update campaigns set status = 'archived', updated_at = now() where id = ${cm.id}`
  return c.json({ ok: true })
})
