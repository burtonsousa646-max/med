// Деньги: двойная запись, пополнения через шлюз и по счёту, бонус первой оплаты, списания, корректировки.
// Все суммы — копейки. Каждая операция — transactions + entries с суммой ноль (проверяет база) и ключом идемпотентности.
import { Hono } from 'hono'
import { sql, type Db, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { onHook, processHook } from '../integrations/hooks.ts'
import { every } from '../schedule.ts'
import { fail, partner, staff, type Env } from './identity.ts'
import { setting } from './partners.ts'

export type AccountKind = 'partner_main' | 'partner_bonus' | 'partner_payout' | 'beeline_revenue' | 'gateway' | 'bank' | 'bonus_fund' | 'ord_fee' | 'payout_clearing' | 'adjustment'
type Line = [companyId: string | null, kind: AccountKind, amountKop: bigint | number]

const PUBLIC_URL = () => process.env.PUBLIC_URL ?? 'http://127.0.0.1:8788'
const APP_URL = () => process.env.APP_URL ?? 'http://127.0.0.1:5174'
export const kop = (v: unknown) => BigInt(v as never)

/* ───────── проводки ───────── */

export async function accountId(tx: Db, companyId: string | null, kind: AccountKind) {
  const [a] = await tx`insert into accounts (company_id, kind) values (${companyId}, ${kind})
                       on conflict (company_id, kind) do update set kind = excluded.kind returning id`
  return a.id as string
}

/** Провести операцию. Повтор с тем же ключом возвращает первую операцию и ничего не проводит. */
export async function post(tx: Tx, t: { kind: string; key: string; companyId?: string | null; campaignId?: string | number | null; memo: string; staffId?: string | null }, lines: Line[]) {
  const [created] = await tx`insert into transactions (kind, idempotency_key, company_id, campaign_id, memo, staff_id)
                             values (${t.kind}, ${t.key}, ${t.companyId ?? null}, ${t.campaignId ?? null}, ${t.memo}, ${t.staffId ?? null})
                             on conflict (idempotency_key) do nothing returning id`
  if (!created) return { id: (await tx`select id from transactions where idempotency_key = ${t.key}`)[0].id as string, fresh: false }
  for (const [companyId, kind, amount] of lines.filter(l => BigInt(l[2]) !== 0n))
    await tx`insert into entries (transaction_id, account_id, amount_kop) values (${created.id}, ${await accountId(tx, companyId, kind)}, ${BigInt(amount)})`
  return { id: created.id as string, fresh: true }
}

export async function balances(db: Db, companyId: string) {
  const rows = await db`select kind, balance_kop from account_balances where company_id = ${companyId}`
  const of = (k: AccountKind) => BigInt(rows.find(r => r.kind === k)?.balance_kop ?? 0)
  const mainKop = of('partner_main'), bonusKop = of('partner_bonus')
  return { mainKop, bonusKop, payoutKop: of('partner_payout'), availableKop: mainKop + bonusKop }
}

/** Списать с партнёра: сначала бонусы, потом основной счёт. Основной может уйти в минус на последний клик —
 * показ останавливается по остатку (модуль pacing), а не здесь. */
export async function charge(tx: Tx, p: { companyId: string; campaignId: string | number; amountKop: bigint; key: string; memo: string }) {
  const { bonusKop } = await balances(tx, p.companyId)
  const fromBonus = bonusKop > 0n ? (bonusKop < p.amountKop ? bonusKop : p.amountKop) : 0n
  return post(tx, { kind: 'charge', key: p.key, companyId: p.companyId, campaignId: p.campaignId, memo: p.memo }, [
    [p.companyId, 'partner_bonus', -fromBonus],
    [p.companyId, 'partner_main', -(p.amountKop - fromBonus)],
    [null, 'beeline_revenue', p.amountKop],
  ])
}

/* ───────── платежи ───────── */

type Payment = { id: string; company_id: string; campaign_id: string | null; method: string; amount_kop: bigint; status: string }
/** Кто ещё хочет знать об оплате (кампании: «ждёт оплату» → проверка). Вызываются в транзакции зачисления. */
export const onPaid: ((tx: Tx, payment: Payment) => Promise<void>)[] = []

export async function createPayment(p: { companyId: string; method: 'sbp' | 'card' | 'invoice'; amountKop: bigint; campaignId?: string | number | null; key: string }) {
  const min = kop(await setting('min_topup_kop'))
  if (p.amountKop < min) fail(422, `минимальное пополнение — ${min / 100n} ₽`)
  const [co] = await sql`select kyc_status from companies where id = ${p.companyId}`
  if (co.kyc_status !== 'verified') fail(422, 'оплата откроется после проверки компании')
  const { payment, invoice } = await sql.begin(async tx => {
    const [existing] = await tx`select * from payments where idempotency_key = ${p.key}`
    if (existing) return { payment: existing as Payment, invoice: null }
    const [payment] = await tx`insert into payments (company_id, campaign_id, method, amount_kop, status, idempotency_key)
                               values (${p.companyId}, ${p.campaignId ?? null}, ${p.method}, ${p.amountKop}, ${p.method === 'invoice' ? 'pending' : 'created'}, ${p.key})
                               returning *`
    if (p.method !== 'invoice') return { payment: payment as Payment, invoice: null }
    const [{ n }] = await tx`select nextval('invoice_number_seq') as n`
    const number = `РП-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`
    const [invoice] = await tx`insert into invoices (company_id, payment_id, number, amount_kop, due_at)
                               values (${p.companyId}, ${payment.id}, ${number}, ${p.amountKop}, now() + interval '5 days') returning *`
    await tx`insert into documents (company_id, kind, number, amount_kop, status, data)
             values (${p.companyId}, 'invoice', ${number}, ${p.amountKop}, 'issued', ${tx.json({ paymentId: payment.id, invoiceId: invoice.id })})`
    return { payment: payment as Payment, invoice }
  })
  let confirmUrl: string | null = null
  if (p.method !== 'invoice' && payment.status === 'created') {
    try {
      const r = await port('payments').create({ paymentId: payment.id, method: p.method as 'sbp' | 'card', amountKop: Number(p.amountKop),
        description: `Пополнение баланса рекламной платформы`, returnUrl: returnTo(payment) })
      confirmUrl = r.confirmUrl.startsWith('/') ? PUBLIC_URL() + r.confirmUrl : r.confirmUrl
      await sql.begin(async tx => {
        await tx`update payments set status = 'pending', updated_at = now() where id = ${payment.id}`
        payment.status = 'pending'
        await tx`insert into external_refs (entity, entity_id, system, external_id, data) values ('payment', ${payment.id}, 'payments', ${r.externalId}, ${tx.json({ confirmUrl, returnUrl: returnTo(payment) })})`
      })
    } catch (e) {
      await sql`update payments set status = 'failed', failure_reason = ${String((e as Error).message)}, updated_at = now() where id = ${payment.id}`
      fail(422, 'платёжный сервис не ответил, попробуйте ещё раз')
    }
  } else if (p.method !== 'invoice') {
    confirmUrl = (await sql`select data->>'confirmUrl' as u from external_refs where entity = 'payment' and entity_id = ${payment.id} and system = 'payments'`)[0]?.u ?? null
  }
  return { payment: paymentView(payment), confirmUrl, invoice: invoice && invoiceView(invoice) }
}

/** Зачислить оплату. Повторный вызов ничего не делает. Сумма не совпала — платёж не зачисляется, разбирает финансист. */
export async function markPaid(tx: Tx, paymentId: string, amountKop: bigint, actor: { staffId?: string } = {}) {
  const [p] = await tx<Payment[]>`select * from payments where id = ${paymentId} for update`
  if (!p) throw new Error(`нет платежа ${paymentId}`)
  if (p.status === 'succeeded') return false
  if (BigInt(p.amount_kop) !== amountKop) {
    await tx`update payments set status = 'failed', failure_reason = ${`пришло ${amountKop} коп. вместо ${p.amount_kop}`}, updated_at = now() where id = ${paymentId}`
    return false
  }
  const first = !(await tx`select 1 from payments where company_id = ${p.company_id} and status = 'succeeded' limit 1`).length
  const via: AccountKind = p.method === 'invoice' ? 'bank' : 'gateway'
  const t = await post(tx, { kind: 'topup', key: `topup:${paymentId}`, companyId: p.company_id, campaignId: p.campaign_id, memo: memoOf(p.method), staffId: actor.staffId },
    [[p.company_id, 'partner_main', amountKop], [null, via, -amountKop]])
  await tx`update payments set status = 'succeeded', transaction_id = ${t.id}, updated_at = now() where id = ${paymentId}`
  await tx`update invoices set status = 'paid', paid_at = now() where payment_id = ${paymentId}`
  if (first) {
    const bonus = kop(await setting('first_campaign_bonus_kop'))
    await post(tx, { kind: 'bonus', key: `bonus:first:${p.company_id}`, companyId: p.company_id, memo: 'бонус за первую оплату' },
      [[p.company_id, 'partner_bonus', bonus], [null, 'bonus_fund', -bonus]])
  }
  for (const fn of onPaid) await fn(tx, { ...p, status: 'succeeded' })
  return true
}

// После оплаты — к запуску кампании, если платили под неё, иначе к балансу
const returnTo = (p: Payment) => p.campaign_id ? `${APP_URL()}/c/${p.campaign_id}/launch?payment=${p.id}` : `${APP_URL()}/cab/balance?payment=${p.id}`

const memoOf = (m: string) => ({ sbp: 'пополнение через СБП', card: 'пополнение картой', invoice: 'оплата по счёту', post: 'постоплата' })[m] ?? 'пополнение'

onHook('payments', 'payment.succeeded', async (b: { paymentId: string; amountKop: number }, tx) => { await markPaid(tx, b.paymentId, BigInt(b.amountKop)) })
onHook('payments', 'payment.failed', async (b: { paymentId: string; reason?: string }, tx) => {
  await tx`update payments set status = 'failed', failure_reason = ${b.reason ?? 'отказ'}, updated_at = now() where id = ${b.paymentId} and status <> 'succeeded'`
})

// Поступление на расчётный счёт: ищем номер счёта в назначении платежа и сверяем ИНН плательщика и сумму.
// Не нашли или не сошлось — поступление ждёт финансиста (audit_log bank.unmatched).
onHook('bankStatement', 'incoming', async (b: { externalId: string; amountKop: number; payerInn: string; purpose: string }, tx) => {
  const number = /РП-\d{4}-\d{6}/.exec(b.purpose)?.[0]
  const [inv] = number ? await tx`select i.payment_id, i.amount_kop, c.inn from invoices i join companies c on c.id = i.company_id
                                  where i.number = ${number} and i.status = 'issued'` : []
  if (inv && inv.inn === b.payerInn && BigInt(inv.amount_kop) === BigInt(b.amountKop)) await markPaid(tx, inv.payment_id, BigInt(b.amountKop))
  else await tx`insert into audit_log (actor_type, action, entity, entity_id, diff) values ('system', 'bank.unmatched', 'bank', ${b.externalId}, ${tx.json(b)})`
})

// Опрос выписки раз в 10 минут; каждое поступление — как вебхук, с тем же ID: повтор не зачислится дважды
every(600_000, 'bank.poll', async () => {
  const since = new Date(Date.now() - 3 * 864e5).toISOString()
  for (const row of await port('bankStatement').incoming({ since })) await processHook('bankStatement', 'incoming', row, row.externalId)
})

/* ───────── ответы ───────── */

const paymentView = (p: any) => ({ id: p.id, method: p.method, amountKop: String(p.amount_kop), status: p.status, campaignId: p.campaign_id && Number(p.campaign_id), createdAt: p.created_at })
const invoiceView = (i: any) => ({ id: i.id, number: i.number, amountKop: String(i.amount_kop), status: i.status, dueAt: i.due_at, issuedAt: i.issued_at, paidAt: i.paid_at })

async function balanceView(companyId: string) {
  const b = await balances(sql, companyId)
  // операции партнёра: сумма его проводок по основному и бонусному счёту
  const operations = await sql`
    select t.id, t.kind, t.memo, t.campaign_id, t.created_at, sum(e.amount_kop)::bigint as amount
    from transactions t join entries e on e.transaction_id = t.id join accounts a on a.id = e.account_id
    where t.company_id = ${companyId} and a.company_id = ${companyId} and a.kind in ('partner_main', 'partner_bonus')
    group by t.id order by t.created_at desc, t.id desc limit 100`
  const invoices = await sql`select * from invoices where company_id = ${companyId} and status = 'issued' order by issued_at desc`
  return {
    mainKop: String(b.mainKop), bonusKop: String(b.bonusKop), payoutKop: String(b.payoutKop), availableKop: String(b.availableKop),
    operations: operations.map(o => ({ id: Number(o.id), kind: o.kind, memo: o.memo, campaignId: o.campaign_id && Number(o.campaign_id), amountKop: String(o.amount), createdAt: o.created_at })),
    invoices: invoices.map(invoiceView),
  }
}

/* ───────── маршруты ───────── */

export const billing = new Hono<Env>()

billing.get('/balance', async c => c.json(await balanceView(c.var.partner.companyId)))

billing.post('/payments', partner('owner', 'accountant'), async c => {
  const b = await c.req.json<{ amountKop: string | number; method: string; campaignId?: number; idempotencyKey: string }>()
  if (!['sbp', 'card', 'invoice'].includes(b.method)) fail(422, 'способ оплаты: sbp, card или invoice')
  if (!b.idempotencyKey) fail(422, 'нужен idempotencyKey')
  let amount: bigint
  try { amount = BigInt(b.amountKop) } catch { return fail(422, 'сумма — целое число копеек') }
  return c.json(await createPayment({ companyId: c.var.partner.companyId, method: b.method as 'sbp', amountKop: amount, campaignId: b.campaignId,
    key: `${c.var.partner.companyId}:${b.idempotencyKey}` }))
})

billing.get('/payments/:id', async c => {
  const [p] = await sql`select * from payments where id = ${c.req.param('id')} and company_id = ${c.var.partner.companyId}`
  if (!p) fail(404, 'нет такого платежа')
  return c.json(paymentView(p))
})

export const billingAdmin = new Hono<Env>()

billingAdmin.post('/invoices/:id/paid', staff('finance'), async c => {
  const [inv] = await sql`select payment_id, amount_kop, company_id from invoices where id = ${c.req.param('id')}`
  if (!inv) fail(404, 'нет такого счёта')
  const done = await sql.begin(async tx => {
    const ok = await markPaid(tx, inv.payment_id, BigInt(inv.amount_kop), { staffId: c.var.staff.staffId })
    await tx`insert into audit_log (actor_type, actor_id, company_id, action, entity, entity_id) values ('staff', ${c.var.staff.staffId}, ${inv.company_id}, 'invoice.paid', 'invoice', ${c.req.param('id')})`
    return ok
  })
  return c.json({ ok: true, changed: done })
})

billingAdmin.post('/adjustments', staff('finance'), async c => {
  const b = await c.req.json<{ companyId: string; amountKop: string | number; account: 'main' | 'bonus'; memo: string; idempotencyKey: string }>()
  if (!b.memo?.trim() || !b.idempotencyKey) fail(422, 'нужны причина и idempotencyKey')
  if (!['main', 'bonus'].includes(b.account)) fail(422, 'счёт: main или bonus')
  let amount: bigint
  try { amount = BigInt(b.amountKop) } catch { return fail(422, 'сумма — целое число копеек') }
  if (amount === 0n) fail(422, 'сумма не может быть нулём')
  const [co] = await sql`select 1 from companies where id = ${b.companyId}`
  if (!co) fail(404, 'нет такой компании')
  const t = await sql.begin(async tx => {
    const r = await post(tx, { kind: 'adjustment', key: `adj:${b.idempotencyKey}`, companyId: b.companyId, memo: b.memo.trim(), staffId: c.var.staff.staffId },
      [[b.companyId, b.account === 'main' ? 'partner_main' : 'partner_bonus', amount], [null, 'adjustment', -amount]])
    await tx`insert into audit_log (actor_type, actor_id, company_id, action, entity, entity_id, diff)
             values ('staff', ${c.var.staff.staffId}, ${b.companyId}, 'balance.adjust', 'transaction', ${r.id}, ${tx.json({ amountKop: String(amount), account: b.account, memo: b.memo })})`
    return r
  })
  return c.json({ ok: true, transactionId: Number(t.id), fresh: t.fresh })
})

/* ───────── заглушка платёжной страницы ───────── */

export const payStub = new Hono()
const stubAllowed = () => (process.env.NODE_ENV !== 'production' || process.env.ALLOW_STUB_LOGIN === '1') && (process.env.INT_PAYMENTS ?? 'stub') === 'stub'

payStub.get('/pay/:id', async c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const [p] = await sql`select amount_kop, method, status from payments where id = ${c.req.param('id')}`
  if (!p) fail(404, 'нет такого платежа')
  const rub = (Number(p.amount_kop) / 100).toLocaleString('ru-RU')
  return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Оплата</title>
<style>body{font:16px system-ui;max-width:420px;margin:48px auto;padding:0 16px}button{display:block;width:100%;margin:8px 0;padding:12px;font:inherit}</style>
<h1>${rub} ₽</h1><p>Заглушка платёжного сервиса (${p.method === 'sbp' ? 'СБП' : 'карта'}). Статус: ${p.status}.</p>
<form method="post"><button name="result" value="ok">оплатить</button><button name="result" value="fail">отказ банка</button></form>`)
})

payStub.post('/pay/:id', async c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const id = c.req.param('id')
  const [p] = await sql<Payment[]>`select * from payments where id = ${id}`
  if (!p) fail(404, 'нет такого платежа')
  const ok = (await c.req.parseBody()).result === 'ok'
  await processHook('payments', ok ? 'payment.succeeded' : 'payment.failed', { paymentId: id, amountKop: Number(p.amount_kop), reason: ok ? undefined : 'отказ банка' }, `stub:${id}:${ok ? 'ok' : 'fail'}`)
  return c.redirect(returnTo(p))
})
