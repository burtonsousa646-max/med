// Уведомления: каналы по настройкам компании, адресаты по типу события, баланс заканчивается — раз в сутки.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { stubState } from '../integrations/stubs.ts'
import { notify, render } from './notifications.ts'

before(resetDb)
after(() => sql.end())
const drain = async () => { while (await runOutbox()); }

test('письмо команде, SMS — только если включено, бухгалтеру — только про деньги', async () => {
  const a = client()
  await a.loginPartner('7701234567')
  const co = await (await a.req('/api/cabinet/company')).json()
  await sql`insert into users (name, email) values ('Бух', 'buh@example.ru')`
  await sql`insert into memberships (company_id, user_id, role) select ${co.id}, id, 'accountant' from users where email = 'buh@example.ru'`
  await sql`update users set email = 'boss@example.ru' where id = (select user_id from memberships where company_id = ${co.id} and role = 'owner')`
  await a.req('/api/cabinet/company', { method: 'PATCH', json: { phone: '+7 916 000-00-00', notify: { sms: true, mail: true, tg: false } } })
  stubState.messages.length = 0
  await sql.begin(tx => notify(tx, co.id, 'creative_rejected', { reason: 'стоп-слово', campaignId: '1' }, 'r1'))
  await sql.begin(tx => notify(tx, co.id, 'creative_rejected', { reason: 'стоп-слово', campaignId: '1' }, 'r1')) // повтор события
  await drain()
  assert.deepEqual(stubState.messages.map(m => m.to).sort(), ['+7 916 000-00-00', 'boss@example.ru'])

  stubState.messages.length = 0
  await a.req('/api/cabinet/company', { method: 'PATCH', json: { notify: { sms: false, mail: true, tg: false } } })
  await sql.begin(tx => notify(tx, co.id, 'payout', { period: '2026-10', amountKop: '28000' }, 'p1'))
  await drain()
  assert.deepEqual(stubState.messages.map(m => m.to).sort(), ['boss@example.ru', 'buh@example.ru'])
  assert.match(render('payout', { period: '2026-10', amountKop: '28000' }).text, /280 ₽/)
})
