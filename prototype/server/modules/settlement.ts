// Расчёты по событиям: списания за клики (пачкой раз в минуту), за засчитанные результаты, возвраты, начисления
// выплат за купоны и подписки и выплата партнёру раз в месяц. Каждый шаг — в транзакции, вместе с отметкой на событии:
// списанное событие не спишется второй раз, даже если воркер упадёт посреди пачки.
import { Hono } from 'hono'
import { sql } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { every } from '../schedule.ts'
import { fail, staff, type Env } from './identity.ts'
import { charge, post } from './billing.ts'
import { notify } from './notifications.ts'

/** Клики одной кампании — одной операцией. Клики моложе 10 с ждут: вдруг по ним ещё придёт отметка антифрода. */
export async function chargeClicks() {
  const groups = await sql`select campaign_id, company_id from clicks where billable and charge_tx_id is null and cost_kop > 0
                           and created_at < now() - interval '10 seconds' group by campaign_id, company_id`
  for (const g of groups) {
    await sql.begin(async tx => {
      const rows = await tx`select click_id, cost_kop from clicks where campaign_id = ${g.campaign_id} and billable and charge_tx_id is null and cost_kop > 0
                            and created_at < now() - interval '10 seconds' for update skip locked`
      if (!rows.length) return
      const total = rows.reduce((s, r) => s + BigInt(r.cost_kop), 0n)
      const t = await charge(tx, { companyId: g.company_id, campaignId: g.campaign_id, amountKop: total, key: `clicks:${g.campaign_id}:${rows[0].click_id}`, memo: `клики: ${rows.length}` })
      await tx`update clicks set charge_tx_id = ${t.id} where click_id in ${tx(rows.map(r => r.click_id))}`
    })
  }
}

/** Засчитанные результаты: заявка и заказ — списание с партнёра; купон и подписка — начисление выплаты партнёру. */
export async function settleConversions() {
  const rows = await sql`select v.id, v.company_id, v.campaign_id, v.amount_kop, cm.type, cm.terms, ot.fee_pct
                         from conversions v join campaigns cm on cm.id = v.campaign_id join offer_types ot on ot.id = cm.type
                         where v.status = 'approved' and v.charge_tx_id is null limit 500`
  for (const v of rows) {
    await sql.begin(async tx => {
      const [locked] = await tx`select 1 from conversions where id = ${v.id} and charge_tx_id is null for update skip locked`
      if (!locked) return
      const n = (k: string) => +v.terms[k] || 0
      let t: { id: string }, cost: bigint
      if (v.type === 'lead' || v.type === 'promo') {
        // заявка — фиксированная цена; заказ — процент с суммы
        cost = v.type === 'lead' ? BigInt(Math.round(n('price') * 100)) : BigInt(v.amount_kop ?? 0) * BigInt(Math.round(n('fee') * 100)) / 10000n
        if (cost <= 0n) { await tx`update conversions set note = 'нет цены результата — не списано' where id = ${v.id}`; return }
        t = await charge(tx, { companyId: v.company_id, campaignId: v.campaign_id, amountKop: cost, key: `conv:${v.id}`, memo: v.type === 'lead' ? 'заявка' : 'заказ по промокоду' })
      } else {
        // абонент заплатил билайну; партнёру — платёж минус комиссия, выплата 1-го числа
        const gross = BigInt(v.amount_kop ?? 0), fee = gross * BigInt(Math.round(Number(v.fee_pct) * 100)) / 10000n
        cost = gross - fee
        t = await post(tx, { kind: 'commission', key: `conv:${v.id}`, companyId: v.company_id, campaignId: v.campaign_id, memo: v.type === 'coupon' ? 'купон' : 'подписка' },
          [[v.company_id, 'partner_payout', cost], [null, 'beeline_revenue', fee], [null, 'gateway', -gross]])
      }
      await tx`update conversions set charge_tx_id = ${t.id}, cost_kop = ${cost} where id = ${v.id}`
    })
  }
  // возврат по уже списанному заказу — деньги партнёру обратно; по купону и подписке — сторно выплаты
  const back = await sql`select v.id, v.company_id, v.campaign_id, v.cost_kop, cm.type from conversions v join campaigns cm on cm.id = v.campaign_id
                         where v.status = 'returned' and v.charge_tx_id is not null and v.cost_kop > 0
                           and not exists (select 1 from transactions t where t.idempotency_key = 'refund:' || v.id) limit 500`
  for (const v of back) {
    await sql.begin(async tx => {
      const amount = BigInt(v.cost_kop)
      await post(tx, { kind: 'refund', key: `refund:${v.id}`, companyId: v.company_id, campaignId: v.campaign_id, memo: 'возврат по заказу' },
        v.type === 'lead' || v.type === 'promo'
          ? [[v.company_id, 'partner_main', amount], [null, 'beeline_revenue', -amount]]
          : [[v.company_id, 'partner_payout', -amount], [null, 'gateway', amount]])
    })
  }
}

every(60_000, 'settlement.clicks', chargeClicks)
every(60_000, 'settlement.conversions', settleConversions)

/* ───────── выплаты ───────── */

/** Выплата за месяц: остаток счёта выплат каждой компании уходит на её расчётный счёт через учётную систему. period — 'YYYY-MM'. */
export async function runPayouts(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) fail(422, 'период — ГГГГ-ММ')
  const due = await sql`select company_id, balance_kop from account_balances where kind = 'partner_payout' and balance_kop > 0`
  let created = 0
  for (const d of due) {
    await sql.begin(async tx => {
      const [p] = await tx`insert into payouts (company_id, period, gross_kop, fee_kop, net_kop) values (${d.company_id}, ${period + '-01'}, ${d.balance_kop}, 0, ${d.balance_kop})
                           on conflict (company_id, period) do nothing returning id`
      if (!p) return
      created++
      const t = await post(tx, { kind: 'payout', key: `payout:${p.id}`, companyId: d.company_id, memo: `выплата за ${period}` },
        [[d.company_id, 'partner_payout', -BigInt(d.balance_kop)], [null, 'payout_clearing', BigInt(d.balance_kop)]])
      await tx`update payouts set transaction_id = ${t.id} where id = ${p.id}`
      await enqueue(tx, 'accounting', 'requestPayout', { payoutId: p.id }, `acc:payout:${p.id}`)
      await notify(tx, d.company_id, 'payout', { period, amountKop: String(d.balance_kop) }, `payout:${p.id}`)
    })
  }
  return { companies: due.length, created }
}

handle('accounting', 'requestPayout', async ({ payoutId }: { payoutId: string }) => {
  const [p] = await sql`select p.*, c.bank from payouts p join companies c on c.id = p.company_id where p.id = ${payoutId}`
  if (!p || p.status !== 'accrued') return
  if (!p.bank) {
    await sql`update payouts set status = 'failed' where id = ${payoutId}`
    return // без реквизитов выплату не отправить: деньги ждут на счёте клиринга, финансист видит failed
  }
  const { externalId } = await port('accounting').requestPayout({ payoutId: String(p.id), companyId: p.company_id, amountKop: Number(p.net_kop), bank: p.bank })
  await sql.begin(async tx => {
    await tx`update payouts set status = 'sent' where id = ${payoutId}`
    await tx`insert into external_refs (entity, entity_id, system, external_id) values ('payout', ${String(payoutId)}, 'accounting', ${externalId}) on conflict do nothing`
  })
})

// Первого числа — выплата за прошлый месяц
every(3600_000, 'settlement.payouts', async () => {
  const now = new Date()
  if (now.getDate() !== 1) return
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  await runPayouts(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
})

export const settlementAdmin = new Hono<Env>()

settlementAdmin.post('/payouts/run', staff('finance'), async c => {
  const { period } = await c.req.json<{ period: string }>()
  const r = await runPayouts(String(period ?? ''))
  await sql`insert into audit_log (actor_type, actor_id, action, diff) values ('staff', ${c.var.staff.staffId}, 'payouts.run', ${sql.json({ period, ...r })})`
  return c.json(r)
})
