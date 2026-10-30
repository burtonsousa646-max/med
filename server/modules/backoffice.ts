// Бэкофис сотрудников билайна: обзор, партнёры, кампании, финансы, справочники, журнал интеграций, спецпроекты.
// Каждое действие сотрудника пишется в audit_log. Модерация и денежные операции — в своих модулях (moderation, billing, settlement, documents).
import { Hono } from 'hono'
import { sql } from '../db.ts'
import { enqueue } from '../integrations/outbox.ts'
import { portStatus } from '../integrations/index.ts'
import { fail, staff, type Env } from './identity.ts'
import { balances } from './billing.ts'
import { notify } from './notifications.ts'
import { getIndex } from './serving.ts'

const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
const audit = (staffId: string, action: string, entity: string, entityId: string, diff: unknown, companyId: string | null = null) =>
  sql`insert into audit_log (actor_type, actor_id, company_id, action, entity, entity_id, diff)
      values ('staff', ${staffId}, ${companyId}, ${action}, ${entity}, ${entityId}, ${sql.json((diff ?? null) as never)})`

export const backoffice = new Hono<Env>()

backoffice.get('/overview', async c => {
  const [r] = await sql`select
    (select count(*) from companies)::int as companies,
    (select count(*) from companies where kyc_status = 'pending')::int as kyc_pending,
    (select count(*) from campaigns where status = 'live')::int as live,
    (select count(*) from moderation_tasks where status = 'queued')::int as moderation,
    (select count(*) from outbox where status = 'failed')::int as outbox_failed,
    (select count(*) from invoices where status = 'issued')::int as invoices,
    (select count(*) from special_requests where status = 'new')::int as special,
    (select count(*) from impressions where created_at >= date_trunc('day', now()))::int as impressions_today,
    (select count(*) from clicks where created_at >= date_trunc('day', now()))::int as clicks_today,
    (select coalesce(sum(e.amount_kop), 0) from entries e join accounts a on a.id = e.account_id join transactions t on t.id = e.transaction_id
      where a.kind = 'beeline_revenue' and t.created_at >= date_trunc('day', now()))::bigint as revenue_today,
    (select coalesce(sum(e.amount_kop), 0) from entries e join accounts a on a.id = e.account_id join transactions t on t.id = e.transaction_id
      where a.kind = 'beeline_revenue' and t.created_at >= date_trunc('month', now()))::bigint as revenue_month`
  return c.json({
    companies: r.companies, kycPending: r.kyc_pending, liveCampaigns: r.live, moderationQueued: r.moderation, outboxFailed: r.outbox_failed,
    invoicesIssued: r.invoices, specialNew: r.special, impressionsToday: r.impressions_today, clicksToday: r.clicks_today,
    revenueTodayKop: s(r.revenue_today), revenueMonthKop: s(r.revenue_month), ports: portStatus(),
  })
})

/* ───────── партнёры ───────── */

backoffice.get('/companies', staff('manager', 'finance', 'moderator'), async c => {
  const q = (c.req.query('q') ?? '').trim()
  const kyc = c.req.query('kyc')
  const rows = await sql`
    select c.id, c.inn, c.name, c.brand, c.segment, c.kyc_status, c.created_at,
           (select count(*) from campaigns where company_id = c.id and status = 'live')::int as live,
           coalesce((select sum(balance_kop) from account_balances where company_id = c.id and kind in ('partner_main', 'partner_bonus')), 0)::bigint as available
    from companies c
    where (${q} = '' or c.inn like ${q + '%'} or c.name ilike ${'%' + q + '%'} or c.brand ilike ${'%' + q + '%'})
      ${kyc ? sql`and c.kyc_status = ${kyc}` : sql``}
    order by c.created_at desc limit 200`
  return c.json(rows.map(r => ({ id: r.id, inn: r.inn, name: r.name, brand: r.brand, segment: r.segment, kycStatus: r.kyc_status, createdAt: r.created_at, liveCampaigns: r.live, availableKop: s(r.available) })))
})

backoffice.get('/companies/:id', staff('manager', 'finance', 'moderator'), async c => {
  const id = c.req.param('id')
  const [co] = await sql`select * from companies where id = ${id}`
  if (!co) fail(404, 'нет такой компании')
  const members = await sql`select u.name, u.email, m.role, m.signer from memberships m join users u on u.id = m.user_id where m.company_id = ${id}`
  const campaigns = await sql`select id, name, type, status, budget_month_kop, created_at from campaigns where company_id = ${id} order by created_at desc`
  const ops = await sql`select t.id, t.kind, t.memo, t.created_at, sum(e.amount_kop)::bigint as amount from transactions t join entries e on e.transaction_id = t.id
                        join accounts a on a.id = e.account_id where t.company_id = ${id} and a.company_id = ${id} group by t.id order by t.created_at desc limit 50`
  const refs = await sql`select system, external_id from external_refs where entity = 'company' and entity_id = ${id}`
  const b = await balances(sql, id)
  return c.json({
    id: co.id, inn: co.inn, kpp: co.kpp, ogrn: co.ogrn, name: co.name, brand: co.brand, segment: co.segment, kycStatus: co.kyc_status,
    kycReason: co.kyc_data?.reason ?? null, risk: co.kyc_data?.risk ?? null, address: co.kyc_data?.address ?? null, b2bManager: co.kyc_data?.b2bManager ?? null,
    phone: co.phone, site: co.site, edoOperator: co.edo_operator, offerVersion: co.offer_version, createdAt: co.created_at,
    members: members.map(m => ({ name: m.name, email: m.email, role: m.role, signer: m.signer })),
    campaigns: campaigns.map(x => ({ id: Number(x.id), name: x.name, type: x.type, status: x.status, budgetMonthKop: s(x.budget_month_kop), createdAt: x.created_at })),
    balance: { mainKop: s(b.mainKop), bonusKop: s(b.bonusKop), payoutKop: s(b.payoutKop) },
    operations: ops.map(o => ({ id: Number(o.id), kind: o.kind, memo: o.memo, amountKop: s(o.amount), createdAt: o.created_at })),
    externalRefs: refs.map(r => ({ system: r.system, externalId: r.external_id })),
  })
})

// Ручная проверка юрлица: высокий риск, спорные случаи, блокировка нарушителя
backoffice.post('/companies/:id/kyc', staff('manager'), async c => {
  const b = await c.req.json<{ status: string; reason?: string }>()
  if (!['verified', 'rejected', 'blocked'].includes(b.status)) fail(422, 'статус: verified, rejected или blocked')
  if (b.status !== 'verified' && !b.reason?.trim()) fail(422, 'укажите причину — её увидит партнёр')
  const id = c.req.param('id')
  await sql.begin(async tx => {
    const [co] = await tx`update companies set kyc_status = ${b.status}, kyc_data = coalesce(kyc_data, '{}'::jsonb) || ${tx.json({ reason: b.reason?.trim() ?? null, review: false })}
                          where id = ${id} returning id`
    if (!co) fail(404, 'нет такой компании')
    if (b.status === 'verified') await enqueue(tx, 'accounting', 'syncCounterparty', { companyId: id }, `acc:cp:${id}`)
    // заблокированная компания перестаёт показываться сразу
    if (b.status === 'blocked') await tx`update campaigns set status = 'paused', updated_at = now() where company_id = ${id} and status = 'live'`
  })
  await audit(c.var.staff.staffId, 'company.kyc', 'company', id, b, id)
  if (b.status === 'blocked') await getIndex(true)
  return c.json({ ok: true })
})

/* ───────── кампании ───────── */

backoffice.get('/campaigns', staff('manager', 'moderator', 'finance'), async c => {
  const status = c.req.query('status')
  const rows = await sql`
    select cm.id, cm.name, cm.type, cm.status, cm.budget_month_kop, cm.placements, cm.created_at, cm.launched_at, co.id as company_id, co.name as company, co.inn,
           coalesce((select sum(cost_kop) from clicks where campaign_id = cm.id and billable and created_at >= date_trunc('month', now())), 0)::bigint as spent_month
    from campaigns cm join companies co on co.id = cm.company_id
    where cm.status <> 'archived' ${status ? sql`and cm.status = ${status}` : sql``}
    order by cm.created_at desc limit 300`
  return c.json(rows.map(r => ({ id: Number(r.id), name: r.name, type: r.type, status: r.status, budgetMonthKop: s(r.budget_month_kop), placements: r.placements,
    createdAt: r.created_at, launchedAt: r.launched_at, companyId: r.company_id, company: r.company, inn: r.inn, spentMonthKop: s(r.spent_month) })))
})

// Остановить кампанию-нарушителя: завершается, партнёр её не возобновит; причина уходит партнёру
backoffice.post('/campaigns/:id/stop', staff('manager', 'moderator'), async c => {
  const { reason } = await c.req.json<{ reason: string }>()
  if (!reason?.trim()) fail(422, 'укажите причину — её увидит партнёр')
  const id = c.req.param('id')
  const [cm] = await sql.begin(async tx => {
    const rows = await tx`update campaigns set status = 'finished', updated_at = now() where id = ${id} and status in ('live', 'paused', 'moderation') returning id, company_id, name`
    if (rows[0]) await notify(tx, rows[0].company_id, 'creative_rejected', { reason: `кампания «${rows[0].name}» остановлена: ${reason.trim()}`, campaignId: id }, `stop:${id}`)
    return rows
  })
  if (!cm) fail(409, 'кампания не идёт и не на проверке')
  await audit(c.var.staff.staffId, 'campaign.stop', 'campaign', id, { reason }, cm.company_id)
  await getIndex(true)
  return c.json({ ok: true })
})

/* ───────── финансы ───────── */

backoffice.get('/finance', staff('finance'), async c => {
  const invoices = await sql`select i.id, i.number, i.amount_kop, i.status, i.issued_at, i.due_at, c.name as company, c.inn from invoices i join companies c on c.id = i.company_id
                             where i.status = 'issued' order by i.issued_at`
  const payouts = await sql`select p.id, p.period, p.net_kop, p.status, p.created_at, c.name as company, c.inn from payouts p join companies c on c.id = p.company_id
                            order by p.created_at desc limit 100`
  const unmatched = await sql`select entity_id, diff, created_at from audit_log where action = 'bank.unmatched' order by created_at desc limit 50`
  const [totals] = await sql`select
    coalesce((select sum(balance_kop) from account_balances where kind = 'beeline_revenue'), 0)::bigint as revenue,
    coalesce((select sum(balance_kop) from account_balances where kind = 'partner_main'), 0)::bigint as deposits,
    coalesce((select sum(balance_kop) from account_balances where kind = 'partner_bonus'), 0)::bigint as bonuses,
    coalesce((select sum(balance_kop) from account_balances where kind = 'partner_payout'), 0)::bigint as payouts_due`
  return c.json({
    totals: { revenueKop: s(totals.revenue), depositsKop: s(totals.deposits), bonusesKop: s(totals.bonuses), payoutsDueKop: s(totals.payouts_due) },
    invoices: invoices.map(i => ({ id: i.id, number: i.number, amountKop: s(i.amount_kop), status: i.status, issuedAt: i.issued_at, dueAt: i.due_at, company: i.company, inn: i.inn })),
    payouts: payouts.map(p => ({ id: Number(p.id), period: p.period, netKop: s(p.net_kop), status: p.status, createdAt: p.created_at, company: p.company, inn: p.inn })),
    unmatched: unmatched.map(u => ({ externalId: u.entity_id, amountKop: s(u.diff?.amountKop), payerInn: u.diff?.payerInn ?? null, purpose: u.diff?.purpose ?? null, createdAt: u.created_at })),
  })
})

/* ───────── справочники ───────── */

backoffice.get('/placements', staff(), async c => {
  const rows = await sql`select * from placements order by id`
  return c.json(rows.map(p => ({ id: p.id, surface: p.surface, name: p.name, format: p.format, pricing: p.pricing, baseCtr: p.base_ctr === null ? null : Number(p.base_ctr), slots: p.slots, minBidKop: s(p.min_bid_kop), needsConsent: p.needs_consent, active: p.active })))
})

backoffice.patch('/placements/:id', staff('admin'), async c => {
  const b = await c.req.json<{ minBidKop?: string | number; baseCtr?: number; slots?: number; active?: boolean; name?: string }>()
  const patch: Record<string, unknown> = {}
  if (b.minBidKop !== undefined) { const v = Number(b.minBidKop); if (!Number.isInteger(v) || v < 0) fail(422, 'минимальная ставка — целое число копеек'); patch.min_bid_kop = String(v) }
  if (b.baseCtr !== undefined) { if (!(b.baseCtr >= 0 && b.baseCtr <= 100)) fail(422, 'CTR — от 0 до 100 %'); patch.base_ctr = b.baseCtr }
  if (b.slots !== undefined) { if (!(Number.isInteger(b.slots) && b.slots >= 1 && b.slots <= 20)) fail(422, 'мест в слоте — от 1 до 20'); patch.slots = b.slots }
  if (b.active !== undefined) patch.active = !!b.active
  if (b.name !== undefined) { if (!b.name.trim()) fail(422, 'название не пустое'); patch.name = b.name.trim() }
  if (!Object.keys(patch).length) fail(422, 'нечего менять')
  const [p] = await sql`update placements set ${sql(patch as never)} where id = ${c.req.param('id')} returning id`
  if (!p) fail(404, 'нет такого места')
  await audit(c.var.staff.staffId, 'placement.update', 'placement', c.req.param('id'), patch)
  await getIndex(true)
  return c.json({ ok: true })
})

// Какие параметры можно менять из бэкофиса и в каких границах
const SETTINGS: Record<string, (v: unknown) => boolean> = {
  first_campaign_bonus_kop: v => Number.isInteger(v) && (v as number) >= 0,
  wide_card_markup_pct: v => typeof v === 'number' && v >= 0 && v <= 200,
  min_budget_month_kop: v => Number.isInteger(v) && (v as number) >= 0,
  min_topup_kop: v => Number.isInteger(v) && (v as number) >= 100,
  offer_version: v => typeof v === 'string' && /^\d{4}-\d{2}(\.\d+)?$/.test(v),
  vat_pct: v => typeof v === 'number' && v >= 0 && v <= 30,
  dispute_days: v => !!v && typeof v === 'object' && Object.values(v).every(x => Number.isInteger(x) && (x as number) > 0 && (x as number) <= 60),
  result_rate: v => !!v && typeof v === 'object' && Object.values(v).every(x => typeof x === 'number' && x > 0 && x <= 1),
  seller: v => !!v && typeof v === 'object' && typeof (v as { inn?: unknown }).inn === 'string',
}

backoffice.get('/settings', staff(), async c => {
  const rows = await sql`select key, value, updated_at from settings order by key`
  return c.json(rows.map(r => ({ key: r.key, value: r.value, editable: r.key in SETTINGS, updatedAt: r.updated_at })))
})

backoffice.patch('/settings/:key', staff('admin'), async c => {
  const key = c.req.param('key')
  const { value } = await c.req.json<{ value: unknown }>()
  if (!SETTINGS[key]) fail(404, 'этот параметр из бэкофиса не меняется')
  if (!SETTINGS[key](value)) fail(422, 'значение вне допустимых границ')
  await sql`update settings set value = ${sql.json(value as never)}, updated_by = ${c.var.staff.staffId}, updated_at = now() where key = ${key}`
  await audit(c.var.staff.staffId, 'setting.update', 'setting', key, { value })
  await getIndex(true)
  return c.json({ ok: true })
})

/* ───────── интеграции ───────── */

backoffice.get('/integrations', staff('admin'), async c => {
  const system = c.req.query('system')
  const log = await sql`select id, system, direction, action, ok, ms, request, response, created_at from integration_log
                        ${system ? sql`where system = ${system}` : sql``} order by id desc limit 200`
  const outbox = await sql`select id, system, action, status, attempts, last_error, next_at, created_at from outbox
                           where status in ('failed', 'pending') order by status, id desc limit 200`
  return c.json({
    ports: portStatus(),
    log: log.map(l => ({ id: Number(l.id), system: l.system, direction: l.direction, action: l.action, ok: l.ok, ms: l.ms, request: l.request, response: l.response, createdAt: l.created_at })),
    outbox: outbox.map(o => ({ id: Number(o.id), system: o.system, action: o.action, status: o.status, attempts: o.attempts, lastError: o.last_error, nextAt: o.next_at, createdAt: o.created_at })),
  })
})

// Повторить упавшую задачу: например, после того как система билайна снова доступна
backoffice.post('/outbox/:id/retry', staff('admin'), async c => {
  const [t] = await sql`update outbox set status = 'pending', attempts = 0, next_at = now() where id = ${c.req.param('id')} and status = 'failed' returning id`
  if (!t) fail(404, 'нет такой упавшей задачи')
  await audit(c.var.staff.staffId, 'outbox.retry', 'outbox', c.req.param('id'), null)
  return c.json({ ok: true })
})

/* ───────── спецпроекты ───────── */

backoffice.get('/special-requests', staff('manager'), async c => {
  const rows = await sql`select r.id, r.data, r.status, r.created_at, c.name as company, c.inn, c.phone, st.name as manager
                         from special_requests r join companies c on c.id = r.company_id left join staff st on st.id = r.manager_id
                         order by r.status = 'new' desc, r.created_at desc limit 200`
  return c.json(rows.map(r => ({ id: Number(r.id), kind: r.data.kind, task: r.data.task, budget: r.data.budget, status: r.status, createdAt: r.created_at, company: r.company, inn: r.inn, phone: r.phone, manager: r.manager })))
})

backoffice.patch('/special-requests/:id', staff('manager'), async c => {
  const { status } = await c.req.json<{ status: string }>()
  if (!['new', 'in_work', 'done', 'declined'].includes(status)) fail(422, 'статус: new, in_work, done, declined')
  const [r] = await sql`update special_requests set status = ${status}, manager_id = coalesce(manager_id, ${c.var.staff.staffId}) where id = ${c.req.param('id')} returning id`
  if (!r) fail(404, 'нет такой заявки')
  await audit(c.var.staff.staffId, 'special.update', 'special_request', c.req.param('id'), { status })
  return c.json({ ok: true })
})

backoffice.get('/audit', staff('admin'), async c => {
  const rows = await sql`select a.id, a.actor_type, a.actor_id, a.action, a.entity, a.entity_id, a.diff, a.created_at, c.name as company
                         from audit_log a left join companies c on c.id = a.company_id order by a.id desc limit 300`
  return c.json(rows.map(r => ({ id: Number(r.id), actorType: r.actor_type, actorId: r.actor_id, action: r.action, entity: r.entity, entityId: r.entity_id, diff: r.diff, company: r.company, createdAt: r.created_at })))
})
