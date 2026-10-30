// Показ: поверхность запрашивает рекламу на место — отбор, фильтры, скор, аукцион второй цены (GSP).
// Индекс живых кампаний держим в памяти и перечитываем раз в 5 с: на запрос показа не ходим в базу за кампаниями.
// Ответ — креативы и подписанные ссылки показа и клика; сам показ записывается, когда поверхность вызовет маяк.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { sql } from '../db.ts'
import { port } from '../integrations/index.ts'
import { fail } from './identity.ts'
import { deal } from './campaigns.ts'

const PUBLIC_URL = () => process.env.PUBLIC_URL ?? 'http://127.0.0.1:8788'
const REFRESH_MS = 5000

/* ───────── подписанный токен показа ───────── */

export type Ticket = { i: string; c: number; cr: number; p: string; k: number; m: string | null; t: number } // показ, кампания, креатив, место, цена клика в копейках, MED-ID, время выдачи

function secret() {
  const s = process.env.SERVE_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') throw new Error('нужен SERVE_SECRET')
  return 'dev-serve-secret'
}
const mac = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 22)
export const sealTicket = (t: Ticket) => { const body = Buffer.from(JSON.stringify(t)).toString('base64url'); return `${body}.${mac(body)}` }
export function openTicket(token: string): Ticket | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(mac(body)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()) as Ticket } catch { return null }
}

/* ───────── индекс ───────── */

type Point = { lat: number; lon: number }
type Entry = {
  id: number; companyId: string; type: string; placements: string[]; bidKop: number | null; wide: boolean
  signals: Record<string, 'any' | 'and' | 'not'>; radiusM: number; dailyCapKop: number | null; budgetKop: number
  startsAt: number | null; endsAt: number | null; landingUrl: string | null; terms: Record<string, string>
  creativeId: number; adText: string; imageKey: string | null; erid: string; brand: string; name: string; site: string | null
  feePct: number; share: boolean; points: Point[]; impressions: number; clicks: number
  spentTodayKop: number; spentMonthKop: number; companyAvailableKop: number; postpay: boolean
}
type Placement = { id: string; slots: number; minBidKop: number; baseCtr: number; pricing: string; needsConsent: boolean }
type Index = { at: number; entries: Entry[]; placements: Map<string, Placement>; triggerFloor: Map<string, number>; markupPct: number; resultRate: Record<string, number>; priorWeight: number }

let index: Index | null = null
let loading: Promise<Index> | null = null

async function load(): Promise<Index> {
  const rows = await sql`
    select c.id, c.company_id, c.type, c.placements, c.bid_kop, c.wide_card, c.targeting, c.daily_cap_kop, c.budget_month_kop,
           c.starts_at, c.ends_at, c.landing_url, c.terms, cr.id as creative_id, cr.ad_text, cr.image_key, cr.erid,
           co.brand, co.name, co.site, co.segment, ot.fee_pct, ot.share
    from campaigns c
    join companies co on co.id = c.company_id
    join offer_types ot on ot.id = c.type
    join lateral (select id, ad_text, image_key, erid from creatives where campaign_id = c.id and status = 'approved' and erid is not null
                  order by version desc limit 1) cr on true
    where c.status = 'live' and co.kyc_status = 'verified'` // заблокированная или непроверенная компания не показывается
  const ids = rows.map(r => r.id), companies = [...new Set(rows.map(r => r.company_id))]
  const points = companies.length ? await sql`select company_id, lat, lon from points where active and company_id in ${sql(companies)}` : []
  const money = companies.length ? await sql`select company_id, sum(balance_kop)::bigint as available from account_balances
                                              where kind in ('partner_main', 'partner_bonus') and company_id in ${sql(companies)} group by company_id` : []
  // траты: списанные клики и результаты плюс ещё не списанные оплачиваемые клики
  const spend = ids.length ? await sql`
    select campaign_id,
           coalesce(sum(cost_kop) filter (where created_at >= date_trunc('day', now())), 0)::bigint as today,
           coalesce(sum(cost_kop) filter (where created_at >= date_trunc('month', now())), 0)::bigint as month
    from (select campaign_id, cost_kop, created_at from clicks where billable and campaign_id in ${sql(ids)}
          union all select campaign_id, cost_kop, created_at from conversions where status = 'approved' and campaign_id in ${sql(ids)}) s
    group by campaign_id` : []
  const perf = ids.length ? await sql`select campaign_id, sum(impressions)::int as impressions, sum(clicks)::int as clicks from stats_hourly
                                       where campaign_id in ${sql(ids)} group by campaign_id` : []
  const placements = new Map((await sql`select * from placements where active`).map(p => [p.id as string,
    { id: p.id, slots: p.slots, minBidKop: Number(p.min_bid_kop), baseCtr: Number(p.base_ctr ?? 0.3) / 100, pricing: p.pricing, needsConsent: p.needs_consent }]))
  const triggerFloor = new Map((await sql`select id, min_bid_kop from triggers`).map(t => [t.id as string, Number(t.min_bid_kop)]))
  const s = Object.fromEntries((await sql`select key, value from settings where key in ('wide_card_markup_pct', 'result_rate', 'ctr_prior_weight')`).map(r => [r.key, r.value]))
  const by = <T extends { campaign_id?: unknown; company_id?: unknown }>(list: T[], key: 'campaign_id' | 'company_id', v: unknown) => list.find(x => String(x[key]) === String(v))
  return {
    at: Date.now(), placements, triggerFloor, markupPct: Number(s.wide_card_markup_pct ?? 30), resultRate: s.result_rate ?? {}, priorWeight: Number(s.ctr_prior_weight ?? 200),
    entries: rows.map(r => ({
      id: Number(r.id), companyId: r.company_id, type: r.type, placements: r.placements, bidKop: r.bid_kop === null ? null : Number(r.bid_kop), wide: r.wide_card,
      signals: r.targeting?.signals ?? {}, radiusM: Number(r.targeting?.radiusM ?? 1000), dailyCapKop: r.daily_cap_kop === null ? null : Number(r.daily_cap_kop),
      budgetKop: Number(r.budget_month_kop), startsAt: r.starts_at ? +new Date(r.starts_at) : null, endsAt: r.ends_at ? +new Date(r.ends_at) : null,
      landingUrl: r.landing_url, terms: r.terms ?? {}, creativeId: Number(r.creative_id), adText: r.ad_text, imageKey: r.image_key, erid: r.erid,
      brand: r.brand, name: r.name, site: r.site, feePct: Number(r.fee_pct), share: r.share,
      points: points.filter(p => p.company_id === r.company_id).map(p => ({ lat: p.lat, lon: p.lon })),
      impressions: by(perf, 'campaign_id', r.id)?.impressions ?? 0, clicks: by(perf, 'campaign_id', r.id)?.clicks ?? 0,
      spentTodayKop: Number(by(spend, 'campaign_id', r.id)?.today ?? 0), spentMonthKop: Number(by(spend, 'campaign_id', r.id)?.month ?? 0),
      companyAvailableKop: Number(by(money, 'company_id', r.company_id)?.available ?? 0), postpay: r.segment === 'large',
    })),
  }
}

/** Индекс не старше 5 с. Перечитывается одним запросом на всех, кто ждёт. */
export async function getIndex(force = false) {
  if (!force && index && Date.now() - index.at < REFRESH_MS) return index
  loading ??= load().then(i => (index = i)).finally(() => (loading = null))
  return loading
}

/* ───────── частота ───────── */

// ponytail: счётчик частоты в памяти процесса; при нескольких экземплярах API — Redis или выборка из impressions
const seen = new Map<string, number[]>() // medId:campaign → времена показов
const FREQ = { impressions: 3, days: 7 }
export function noteImpression(medId: string | null, campaignId: number, at = Date.now()) {
  if (!medId) return
  const k = `${medId}:${campaignId}`, list = (seen.get(k) ?? []).filter(t => at - t < FREQ.days * 864e5)
  list.push(at)
  seen.set(k, list)
}
const frequencyOk = (medId: string | null, campaignId: number, now = Date.now()) =>
  !medId || (seen.get(`${medId}:${campaignId}`) ?? []).filter(t => now - t < FREQ.days * 864e5).length < FREQ.impressions

/* ───────── аукцион ───────── */

const distanceM = (a: Point, b: Point) => {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r
  return Math.sqrt(x * x + y * y) * 6_371_000
}

/** Ставка за клик в копейках. Переход — ставка или автоставка (полторы минимальных); за результат — цена результата × доля кликов, ставших результатом. */
export function effectiveBidKop(e: Entry, floorKop: number, idx: Pick<Index, 'markupPct' | 'resultRate'>) {
  const n = (k: string) => +e.terms[k] || 0, rate = idx.resultRate[e.type] ?? 0.03
  const base = e.type === 'click' ? e.bidKop ?? floorKop * 1.5
    : e.type === 'lead' ? n('price') * 100 * rate
    : e.type === 'promo' ? n('check') * n('fee') * rate // чек ₽ × % комиссии = копейки
    : n('price') * e.feePct * rate // купон и подписка: доля билайна с платежа абонента
  return Math.round(base * (e.wide ? 1 + idx.markupPct / 100 : 1))
}

export type Winner = { entry: Entry; priceKop: number; scoreKop: number; ctr: number }

/** Отбор, фильтры, скор и GSP. Чистая функция над индексом — её проверяет тест на одинаковых данных. */
export function auction(idx: Index, req: { placement: string; medId: string | null; lat?: number; lon?: number; limit?: number; matched?: Record<string, number>; now?: number }): Winner[] {
  const pl = idx.placements.get(req.placement)
  if (!pl) return []
  const now = req.now ?? Date.now()
  const matched = req.matched ?? {}
  const scored = idx.entries.filter(e => {
    if (!e.placements.includes(pl.id)) return false
    if ((e.startsAt && now < e.startsAt) || (e.endsAt && now > e.endsAt)) return false
    // деньги: купон и подписка платит абонент; остальным нужен остаток, дневной лимит и месячный бюджет
    if (!e.share) {
      if (e.companyAvailableKop <= 0 && !e.postpay) return false
      if (e.dailyCapKop !== null && e.spentTodayKop >= e.dailyCapKop) return false
      if (e.spentMonthKop >= e.budgetKop) return false
    }
    // гео: рядом хотя бы с одной активной точкой, если поверхность знает, где абонент
    if (req.lat !== undefined && req.lon !== undefined && e.points.length && !e.points.some(p => distanceM(p, { lat: req.lat!, lon: req.lon! }) <= e.radiusM)) return false
    if (!frequencyOk(req.medId, e.id, now)) return false
    // сигналы: только если абонент известен; без MED-ID показ по контексту (тир T1)
    if (req.medId) {
      const sig = Object.entries(e.signals), has = (id: string) => (matched[id] ?? 0) > 0
      if (sig.some(([id, b]) => b === 'not' && has(id))) return false
      if (sig.some(([id, b]) => b === 'and' && !has(id))) return false
      const any = sig.filter(([, b]) => b === 'any')
      if (any.length && !any.some(([id]) => has(id))) return false
    }
    return true
  }).map(e => {
    const floor = Math.max(pl.minBidKop, ...Object.entries(e.signals).filter(([, b]) => b !== 'not').map(([id]) => idx.triggerFloor.get(id) ?? 0))
    const bid = effectiveBidKop(e, floor, idx)
    // pCTR: априорный CTR места, сглаженный наблюдаемым CTR кампании (байесовское среднее)
    const ctr = (e.clicks + pl.baseCtr * idx.priorWeight) / (e.impressions + idx.priorWeight)
    return { entry: e, bid, floor, ctr, score: bid * ctr }
  // минимальная ставка — за клик; офферы с оплатой за результат за клик не платят и конкурируют ожидаемой выручкой
  }).filter(x => x.entry.type !== 'click' || x.bid >= x.floor)
    .sort((a, b) => b.score - a.score || a.entry.id - b.entry.id)

  // одна реклама от компании на показ
  const seenCo = new Set<string>(), uniq = scored.filter(x => !seenCo.has(x.entry.companyId) && seenCo.add(x.entry.companyId))
  const slots = Math.min(pl.slots, req.limit ?? pl.slots)
  const won = uniq.slice(0, slots)
  return won.map((x, i) => {
    const next = uniq[i + 1]
    // вторая цена: столько, чтобы удержать место над следующим, не ниже минимальной и не выше своей ставки
    const price = next ? Math.ceil(next.score / x.ctr) + 1 : x.floor
    return { entry: x.entry, priceKop: Math.min(x.bid, Math.max(x.floor, price)), scoreKop: x.score, ctr: x.ctr }
  })
}

/* ───────── маршрут ───────── */

// Ключи поверхностей: SURFACE_KEYS=app:ключ,site:ключ. Не заданы — запрос без ключа (разработка, эталонная витрина).
function surfaceOk(key: string | undefined) {
  const keys = (process.env.SURFACE_KEYS ?? '').split(',').map(x => x.split(':')[1]).filter(Boolean)
  return !keys.length || (!!key && keys.includes(key))
}

export const servingPublic = new Hono()

servingPublic.post('/serve', async c => {
  if (!surfaceOk(c.req.header('x-surface-key'))) fail(401, 'нужен ключ поверхности')
  const b = await c.req.json<{ placement: string; medId?: string; lat?: number; lon?: number; limit?: number }>()
  const idx = await getIndex()
  if (!idx.placements.has(b.placement)) fail(404, 'нет такого места показа')
  const medId = typeof b.medId === 'string' && b.medId ? b.medId.slice(0, 64) : null
  // согласие на рекламу: без него ничего не показываем
  if (medId && !(await port('consents').check({ medId, purpose: idx.placements.get(b.placement)!.needsConsent ? 'push' : 'ads' }))) return c.json({ ads: [] })
  const triggerIds = [...new Set(idx.entries.flatMap(e => Object.keys(e.signals)))]
  const matched = medId && triggerIds.length ? await port('dmp').match({ medId, triggerIds }) : {}
  const lat = typeof b.lat === 'number' ? b.lat : undefined, lon = typeof b.lon === 'number' ? b.lon : undefined
  const won = auction(idx, { placement: b.placement, medId, lat, lon, limit: b.limit, matched })
  const now = Date.now()
  return c.json({
    ads: won.map(w => {
      const e = w.entry, d = deal({ type: e.type, terms: e.terms }, { brand: e.brand, name: e.name, site: e.site }, e.feePct)
      const token = sealTicket({ i: randomUUID(), c: e.id, cr: e.creativeId, p: b.placement, k: w.priceKop, m: medId, t: now })
      return {
        token, campaignId: e.id, type: e.type, wide: e.wide && b.placement === 'showcase',
        creative: { text: e.adText, imageUrl: e.imageKey ? port('storage').url(e.imageKey) : null, erid: e.erid, brand: e.brand || e.name, offer: d.offer, cta: d.cta, line: d.line },
        impressionUrl: `${PUBLIC_URL()}/api/public/i/${token}`,
        clickUrl: `${PUBLIC_URL()}/api/public/c/${token}`,
      }
    }),
  })
})
