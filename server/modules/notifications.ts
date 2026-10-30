// Уведомления партнёру. Модуль кладёт событие в очередь в своей транзакции; получатели и канал выбираются при отправке.
// ponytail: только почта участникам компании; SMS, Telegram и настройки notify — в модуле уведомлений дня 4
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { enqueue, handle } from '../integrations/outbox.ts'

export const notify = (tx: Tx, companyId: string, template: string, params: Record<string, string>, key: string) =>
  enqueue(tx, 'messaging', 'company', { companyId, template, params }, `notify:${key}`)

handle('messaging', 'company', async ({ companyId, template, params }: { companyId: string; template: string; params: Record<string, string> }) => {
  const to = await sql`select distinct coalesce(u.email, i.data->>'email') as email from memberships m join users u on u.id = m.user_id
                       left join identities i on i.user_id = u.id where m.company_id = ${companyId} and m.role in ('owner', 'staff')`
  for (const { email } of to.filter(r => r.email))
    await port('messaging').send({ channel: 'email', to: email, template, params, idempotencyKey: `${companyId}:${template}:${JSON.stringify(params)}:${email}` })
})
