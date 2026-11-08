// Документы: список и печатные формы в кабинете, закрытие месяца (акт и счёт-фактура по списаниям), ЭДО, выручка в учёт.
// Документ хранит данные (data); печатная форма — HTML, собирается по ним. Для ЭДО форма кладётся в хранилище.
import { Hono } from 'hono'
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { onHook } from '../integrations/hooks.ts'
import { every } from '../schedule.ts'
import { fail, staff, type Env } from './identity.ts'
import { setting } from './partners.ts'

const TITLES: Record<string, string> = { offer: 'Оферта', invoice: 'Счёт на оплату', act: 'Акт оказанных услуг', sf: 'Счёт-фактура', agent_report: 'Отчёт агента', contract: 'Договор' }
const rub = (kop: bigint | number | string) => (Number(kop) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
const docView = (d: any) => ({ id: d.id, kind: d.kind, title: TITLES[d.kind], number: d.number, period: d.period, amountKop: d.amount_kop && String(d.amount_kop), status: d.status, createdAt: d.created_at })

/* ───────── закрытие месяца ───────── */

/** Акт и счёт-фактура за месяц каждой компании, у которой были списания. Повтор ничего не создаёт второй раз.
 * period — 'YYYY-MM'. */
export async function closeMonth(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) fail(422, 'период — ГГГГ-ММ')
  const from = `${period}-01`
  const vat = await setting<number>('vat_pct')
  const rows = await sql`select t.company_id, (-sum(e.amount_kop))::bigint as amount, count(distinct t.id)::int as ops
                         from transactions t join entries e on e.transaction_id = t.id join accounts a on a.id = e.account_id
                         where t.kind = 'charge' and a.company_id = t.company_id and a.kind in ('partner_main', 'partner_bonus')
                           and t.created_at >= ${from}::date and t.created_at < (${from}::date + interval '1 month')
                         group by t.company_id having sum(e.amount_kop) < 0`
  let created = 0
  for (const r of rows) {
    await sql.begin(async tx => {
      const amount = BigInt(r.amount), base = BigInt(100 + vat)
      const vatKop = (amount * BigInt(vat) * 2n + base) / (2n * base) // НДС в т. ч., округление до копейки
      const data = { period, operations: r.ops, vatPct: vat, vatKop: String(vatKop) }
      for (const kind of ['act', 'sf']) {
        const [d] = await tx`insert into documents (company_id, kind, number, period, amount_kop, status, data)
                             values (${r.company_id}, ${kind}, ${`${kind === 'act' ? 'А' : 'СФ'}-${period}`}, ${from}, ${amount}, 'issued', ${tx.json(data)})
                             on conflict (company_id, kind, number) do nothing returning id`
        if (!d) continue
        created++
        await enqueue(tx, 'edo', 'send', { documentId: d.id }, `edo:send:${d.id}`)
      }
      await enqueue(tx, 'accounting', 'postRevenue', { companyId: r.company_id, period }, `acc:rev:${r.company_id}:${period}`)
    })
  }
  return { companies: rows.length, created }
}

// Первого числа закрываем прошлый месяц. Проверяем раз в час: повтор безопасен.
every(3600_000, 'documents.closeMonth', async () => {
  const now = new Date()
  if (now.getDate() !== 1) return
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  await closeMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`)
})

/* ───────── ЭДО и учёт ───────── */

// Отправить можно, только если компания подключила ЭДО; иначе документ ждёт в кабинете, задача завершается
handle('edo', 'send', async ({ documentId }: { documentId: string }) => {
  const [d] = await sql`select d.*, c.inn, c.edo_operator from documents d join companies c on c.id = d.company_id where d.id = ${documentId}`
  if (!d || !d.edo_operator || d.status !== 'issued') return
  const key = `documents/${d.company_id}/${d.id}.html`
  await port('storage').put({ key, body: new TextEncoder().encode(await render(d)), contentType: 'text/html; charset=utf-8' })
  const { externalId } = await port('edo').send({ documentId: d.id, inn: d.inn, kind: d.kind, fileKey: key })
  await sql.begin(async tx => {
    await tx`update documents set status = 'sent', file_key = ${key} where id = ${d.id}`
    await tx`insert into external_refs (entity, entity_id, system, external_id) values ('document', ${d.id}, 'edo', ${externalId}) on conflict do nothing`
  })
})

// Статус от оператора: delivered — доставлен, signed — подписан партнёром, rejected — отказ в подписи
onHook('edo', 'document.status', async (b: { externalId: string; status: string }, tx: Tx) => {
  if (!['delivered', 'signed', 'rejected'].includes(b.status)) throw new Error(`неизвестный статус ЭДО ${b.status}`)
  await tx`update documents set status = ${b.status}
           where id = (select entity_id::uuid from external_refs where system = 'edo' and entity = 'document' and external_id = ${b.externalId})`
})

handle('accounting', 'postRevenue', async ({ companyId, period }: { companyId: string; period: string }) => {
  const docs = await sql`select id, amount_kop from documents where company_id = ${companyId} and kind = 'act' and period = ${period + '-01'}`
  if (!docs.length) return
  const { externalId } = await port('accounting').postRevenue({ companyId, period, amountKop: Number(docs[0].amount_kop), documentIds: docs.map(d => d.id) })
  await sql`insert into external_refs (entity, entity_id, system, external_id) values ('revenue', ${companyId + ':' + period}, 'accounting', ${externalId}) on conflict do nothing`
})

/* ───────── печатная форма ───────── */

async function render(d: any) {
  const [co] = await sql`select name, inn, kpp, kyc_data from companies where id = ${d.company_id}`
  const seller = await setting<{ name: string; inn: string; kpp: string; address: string }>('seller')
  const date = new Date(d.created_at).toLocaleDateString('ru-RU')
  const party = (role: string, p: { name: string; inn: string; kpp?: string | null; address?: string | null }) =>
    `<p><b>${role}:</b> ${esc(p.name)}, ИНН ${esc(p.inn)}${p.kpp ? `, КПП ${esc(p.kpp)}` : ''}${p.address ? `, ${esc(p.address)}` : ''}</p>`
  const buyer = { name: co.name, inn: co.inn, kpp: co.kpp, address: co.kyc_data?.address }
  const body = ({
    offer: () => `<p>Принята версия оферты ${esc(d.data?.version)}.</p>`,
    invoice: () => `<table><tr><th>Услуга</th><th>Сумма, ₽</th></tr><tr><td>Пополнение баланса рекламной платформы</td><td>${rub(d.amount_kop)}</td></tr></table>
      <p>В назначении платежа укажите номер счёта: <b>${esc(d.number)}</b>.</p>`,
    act: () => `<table><tr><th>Услуга</th><th>Период</th><th>Сумма, ₽</th></tr><tr><td>Размещение рекламы на поверхностях билайна (${esc(d.data?.operations)} операций)</td><td>${esc(d.data?.period)}</td><td>${rub(d.amount_kop)}</td></tr></table>
      <p>в т. ч. НДС ${esc(d.data?.vatPct)} %: ${rub(d.data?.vatKop ?? 0)} ₽. Услуги оказаны полностью, претензий нет.</p>`,
    sf: () => `<table><tr><th>Наименование</th><th>Стоимость без НДС, ₽</th><th>НДС, ₽</th><th>Всего, ₽</th></tr>
      <tr><td>Размещение рекламы, ${esc(d.data?.period)}</td><td>${rub(BigInt(d.amount_kop) - BigInt(d.data?.vatKop ?? 0))}</td><td>${rub(d.data?.vatKop ?? 0)}</td><td>${rub(d.amount_kop)}</td></tr></table>`,
  } as Record<string, () => string>)[d.kind]?.() ?? ''
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${esc(TITLES[d.kind])} ${esc(d.number)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#111}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#f3f3f3}@media print{body{margin:0}}</style>
<h1>${esc(TITLES[d.kind])} № ${esc(d.number)} от ${date}</h1>
${party(d.kind === 'act' ? 'Исполнитель' : 'Продавец', seller)}${party(d.kind === 'act' ? 'Заказчик' : 'Покупатель', buyer)}
${body}</html>`
}

/* ───────── маршруты ───────── */

export const documents = new Hono<Env>()

documents.get('/documents', async c => {
  const rows = await sql`select * from documents where company_id = ${c.var.partner.companyId} order by created_at desc limit 200`
  return c.json(rows.map(docView))
})

documents.get('/documents/:id/file', async c => {
  const [d] = await sql`select * from documents where id = ${c.req.param('id')} and company_id = ${c.var.partner.companyId}`
  if (!d) fail(404, 'нет такого документа')
  return c.html(await render(d))
})

export const documentsAdmin = new Hono<Env>()

documentsAdmin.post('/documents/close-month', staff('finance'), async c => {
  const { period } = await c.req.json<{ period: string }>()
  const r = await closeMonth(String(period ?? ''))
  await sql`insert into audit_log (actor_type, actor_id, action, diff) values ('staff', ${c.var.staff.staffId}, 'documents.closeMonth', ${sql.json({ period, ...r })})`
  return c.json(r)
})
