// Отчёты: почасовые свёртки показов и кликов, статистика кампании за период, ежемесячная статистика в ОРД.
// Кабинет читает свёртки, а не сырые показы. Результаты и деньги берутся из conversions и clicks напрямую: их мало,
// а статус результата может смениться через неделю, и свёртка по часу создания его бы не увидела.
import { Hono } from 'hono'
import { sql } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { every } from '../schedule.ts'
import { fail, type Env } from './identity.ts'

/** Пересчитать свёртки за последние hours часов. Повтор безопасен: строка часа перезаписывается целиком. */
export async function rollup(hours = 3) {
  await sql`
    insert into stats_hourly (campaign_id, hour, placement, impressions, reach, clicks, billable_clicks, conversions, spend_kop)
    select campaign_id, hour, placement, sum(imp)::int, sum(reach)::int, sum(cl)::int, sum(bcl)::int, sum(conv)::int, sum(spend)::bigint
    from (
      select campaign_id, date_trunc('hour', created_at) as hour, placement, count(*) as imp, count(distinct med_id) as reach, 0 as cl, 0 as bcl, 0 as conv, 0 as spend
      from impressions where created_at >= date_trunc('hour', now()) - ${hours + ' hours'}::interval group by 1, 2, 3
      union all
      select campaign_id, date_trunc('hour', created_at), placement, 0, 0, count(*), count(*) filter (where billable), 0, coalesce(sum(cost_kop), 0)
      from clicks where created_at >= date_trunc('hour', now()) - ${hours + ' hours'}::interval group by 1, 2, 3
      union all
      select v.campaign_id, date_trunc('hour', v.created_at), coalesce(c.placement, 'other'), 0, 0, 0, 0, count(*), 0
      from conversions v left join clicks c on c.click_id = v.click_id
      where v.created_at >= date_trunc('hour', now()) - ${hours + ' hours'}::interval group by 1, 2, 3
    ) s group by 1, 2, 3
    on conflict (campaign_id, hour, placement) do update set impressions = excluded.impressions, reach = excluded.reach, clicks = excluded.clicks,
      billable_clicks = excluded.billable_clicks, conversions = excluded.conversions, spend_kop = excluded.spend_kop`
}
every(60_000, 'reporting.rollup', () => rollup())

/* ───────── ОРД: статистика за месяц ───────── */

every(3600_000, 'reporting.ord', async () => {
  const now = new Date()
  if (now.getDate() !== 1) return
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  await enqueue(sql, 'ord', 'reportStats', { period }, `ord:stats:${period}`)
})

handle('ord', 'reportStats', async ({ period }: { period: string }) => {
  const from = `${period}-01`
  const rows = await sql`select cr.erid, s.placement, sum(s.impressions)::int as impressions, sum(s.spend_kop)::bigint as amount
                         from stats_hourly s join lateral (select erid from creatives where campaign_id = s.campaign_id and erid is not null order by version desc limit 1) cr on true
                         where s.hour >= ${from}::date and s.hour < ${from}::date + interval '1 month'
                         group by cr.erid, s.placement having sum(s.impressions) > 0`
  if (!rows.length) return
  const { externalId } = await port('ord').reportStats({ period, rows: rows.map(r => ({ erid: r.erid, placement: r.placement, impressions: r.impressions, amountKop: Number(r.amount) })) })
  await sql`insert into external_refs (entity, entity_id, system, external_id) values ('ord_report', ${period}, 'ord', ${externalId}) on conflict do nothing`
})

/* ───────── статистика кампании ───────── */

export const reporting = new Hono<Env>()

reporting.get('/campaigns/:id/stats', async c => {
  const id = c.req.param('id')
  const [cm] = await sql`select id, type, launched_at from campaigns where id = ${id} and company_id = ${c.var.partner.companyId}`
  if (!cm) fail(404, 'нет такой кампании')
  const to = c.req.query('to') ? new Date(c.req.query('to')!) : new Date()
  const from = c.req.query('from') ? new Date(c.req.query('from')!) : new Date(to.getTime() - 14 * 864e5)
  if (isNaN(+from) || isNaN(+to) || from > to) fail(422, 'from и to — даты, from не позже to')

  const [t] = await sql`select coalesce(sum(impressions), 0)::int as impressions, coalesce(sum(clicks), 0)::int as clicks,
                               coalesce(sum(billable_clicks), 0)::int as billable, coalesce(sum(spend_kop), 0)::bigint as click_spend
                        from stats_hourly where campaign_id = ${id} and hour >= date_trunc('hour', ${from}::timestamptz) and hour <= ${to}`
  const [reach] = await sql`select count(distinct med_id)::int as n from impressions where campaign_id = ${id} and created_at between ${from} and ${to}`
  const conv = await sql`select status, count(*)::int as n, coalesce(sum(cost_kop), 0)::bigint as cost from conversions
                         where campaign_id = ${id} and created_at between ${from} and ${to} group by status`
  const byStatus = (s: string) => conv.find(r => r.status === s)
  const share = cm.type === 'coupon' || cm.type === 'sub'
  const resultCost = BigInt(byStatus('approved')?.cost ?? 0)
  const daily = await sql`select date_trunc('day', hour) as day, sum(impressions)::int as impressions, sum(clicks)::int as clicks, sum(conversions)::int as conversions
                          from stats_hourly where campaign_id = ${id} and hour between ${from} and ${to} group by 1 order by 1`
  const hourly = await sql`select hour, sum(clicks)::int as clicks, sum(impressions)::int as impressions from stats_hourly
                           where campaign_id = ${id} and hour > now() - interval '48 hours' group by 1 order by 1`
  const places = await sql`select s.placement, p.name, sum(s.impressions)::int as impressions, sum(s.clicks)::int as clicks, sum(s.spend_kop)::bigint as spend
                           from stats_hourly s left join placements p on p.id = s.placement
                           where s.campaign_id = ${id} and s.hour between ${from} and ${to} group by 1, 2 order by 3 desc`
  const ctr = (cl: number, im: number) => (im ? Math.round((cl / im) * 10000) / 100 : 0)
  return c.json({
    from: from.toISOString(), to: to.toISOString(),
    totals: {
      impressions: t.impressions, reach: reach.n, clicks: t.clicks, billableClicks: t.billable, ctr: ctr(t.clicks, t.impressions),
      spendKop: String(BigInt(t.click_spend) + (share ? 0n : resultCost)),
      payoutKop: String(share ? resultCost : 0n),
      results: { pending: byStatus('pending')?.n ?? 0, approved: byStatus('approved')?.n ?? 0, rejected: byStatus('rejected')?.n ?? 0, returned: byStatus('returned')?.n ?? 0 },
    },
    daily: daily.map(d => ({ day: d.day, impressions: d.impressions, clicks: d.clicks, conversions: d.conversions })),
    hourly: hourly.map(h => ({ hour: h.hour, impressions: h.impressions, clicks: h.clicks })),
    placements: places.map(p => ({ placement: p.placement, name: p.name ?? p.placement, impressions: p.impressions, clicks: p.clicks, ctr: ctr(p.clicks, p.impressions), spendKop: String(p.spend) })),
  })
})
