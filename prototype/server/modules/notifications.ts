// Уведомления партнёру. Модуль кладёт событие в очередь в своей транзакции; получатели, каналы и текст выбираются при отправке.
// Каналы — по настройкам компании (notify): почта участникам, SMS на телефон компании. Telegram — когда появится привязка чата.
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'
import { every } from '../schedule.ts'

const APP_URL = () => process.env.APP_URL ?? 'http://127.0.0.1:5174'
const rub = (kop: string | undefined) => `${(Number(kop ?? 0) / 100).toLocaleString('ru-RU')} ₽`

type Template = { subject: string; text: (p: Record<string, string>) => string; sms?: (p: Record<string, string>) => string; to: 'team' | 'money' | 'all' }

/** Тексты сообщений. Адаптер почты или SMS билайна берёт готовый текст из render(), а не собирает его сам. */
export const TEMPLATES: Record<string, Template> = {
  login_code: { subject: 'Код входа', text: p => `Код для входа в рекламную платформу билайна: ${p.code}. Никому его не сообщайте.`, sms: p => `Билайн: код входа ${p.code}. Никому не сообщайте`, to: 'all' },
  invitation: { subject: 'Приглашение в компанию', text: p => `Вас пригласили в ${p.company} в рекламной платформе билайна. Принять: ${p.url}`, to: 'all' },
  approval_request: { subject: 'Подтвердите запуск рекламы', text: p => `Сотрудник собрал кампанию «${p.campaign}» и просит подтвердить запуск: ${p.url}`, to: 'all' },
  campaign_live: { subject: 'Кампания запущена', text: p => `Кампания «${p.campaign}» прошла проверку, получила erid ${p.erid} и участвует в показах. Статистика: ${APP_URL()}/cab/stats/${p.campaignId}`, sms: p => `Билайн: кампания «${p.campaign}» запущена`, to: 'team' },
  creative_rejected: { subject: 'Объявление не прошло проверку', text: p => `Текст объявления не прошёл проверку: ${p.reason}. Исправьте его: ${APP_URL()}/c/${p.campaignId}/launch`, sms: () => 'Билайн: объявление не прошло проверку, исправьте текст в кабинете', to: 'team' },
  new_lead: { subject: 'Новая заявка', text: p => `Новая заявка по кампании ${p.campaignId}: ${p.name || 'без имени'}, ${p.phone}. Подтвердите или оспорьте её в кабинете в течение 7 дней.`, sms: p => `Билайн: новая заявка, ${p.phone}`, to: 'team' },
  low_balance: { subject: 'Баланс заканчивается', text: p => `На балансе ${rub(p.availableKop)} — этого хватит примерно на ${p.days} дн. показов. Пополнить: ${APP_URL()}/cab/balance`, sms: p => `Билайн: на балансе ${rub(p.availableKop)}, пополните`, to: 'money' },
  payout: { subject: 'Выплата отправлена', text: p => `Выплата за ${p.period}: ${rub(p.amountKop)} отправлена на расчётный счёт компании.`, to: 'money' },
}

export function render(template: string, params: Record<string, string>) {
  const t = TEMPLATES[template]
  return t ? { subject: t.subject, text: t.text(params), sms: t.sms?.(params) ?? null } : { subject: template, text: JSON.stringify(params), sms: null }
}

export const notify = (tx: Tx, companyId: string, template: string, params: Record<string, string>, key: string) =>
  enqueue(tx, 'messaging', 'company', { companyId, template, params }, `notify:${key}`)

handle('messaging', 'company', async ({ companyId, template, params }: { companyId: string; template: string; params: Record<string, string> }) => {
  const [co] = await sql`select phone, notify from companies where id = ${companyId}`
  if (!co) return
  const t = TEMPLATES[template]
  // команда — те, кто ведёт кампании; деньги — ещё и бухгалтер
  const roles = t?.to === 'money' ? ['owner', 'staff', 'accountant'] : ['owner', 'staff']
  if (co.notify?.mail !== false) {
    const to = await sql`select distinct coalesce(u.email, i.data->>'email') as email from memberships m join users u on u.id = m.user_id
                         left join identities i on i.user_id = u.id where m.company_id = ${companyId} and m.role in ${sql(roles)}`
    for (const { email } of to.filter(r => r.email))
      await port('messaging').send({ channel: 'email', to: email, template, params, idempotencyKey: `${companyId}:${template}:${JSON.stringify(params)}:${email}` })
  }
  if (co.notify?.sms && co.phone && t?.sms)
    await port('messaging').send({ channel: 'sms', to: co.phone, template, params, idempotencyKey: `${companyId}:${template}:${JSON.stringify(params)}:sms` })
})

// Баланс заканчивается: денег меньше чем на 3 дня трат по живым кампаниям. Не чаще раза в сутки.
every(3600_000, 'notifications.lowBalance', async () => {
  const rows = await sql`
    select c.company_id, b.available, sum(coalesce(c.daily_cap_kop, c.budget_month_kop / 30))::bigint as per_day
    from campaigns c join offer_types ot on ot.id = c.type
    join (select company_id, sum(balance_kop)::bigint as available from account_balances where kind in ('partner_main', 'partner_bonus') group by company_id) b on b.company_id = c.company_id
    where c.status = 'live' and not ot.share group by c.company_id, b.available`
  const day = new Date().toISOString().slice(0, 10)
  for (const r of rows.filter(r => BigInt(r.per_day) > 0n && BigInt(r.available) < BigInt(r.per_day) * 3n)) {
    const days = String(Math.max(0, Math.floor(Number(r.available) / Number(r.per_day))))
    await sql.begin(tx => notify(tx, r.company_id, 'low_balance', { availableKop: String(r.available), days }, `low:${r.company_id}:${day}`))
  }
})
