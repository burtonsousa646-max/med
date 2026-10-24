// Сквозная проверка контракта на тестовом сервере: npm test. Годится и для настоящего бэкенда —
// замените call() на fetch к его адресу.
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.DB_PATH = ':memory:'
const { app } = await import('./index.ts')

let cookie = ''
async function call(method: string, path: string, body?: object) {
  const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie
  return { status: res.status, body: await res.json() }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

test('переход: вход, сборка, оплата, запуск, статистика, баланс', async () => {
  assert.equal((await call('GET', '/catalog')).body.offerTypes.length, 5)
  assert.equal((await call('GET', '/campaigns')).body.length, 1, 'у новой копии есть черновик')
  await call('POST', '/session/login', { provider: 'sber' })
  const { body: c } = await call('POST', '/campaigns', { type: 'click' })
  assert.equal(c.status, 'draft')
  assert.ok(c.moderation, 'текст по умолчанию со словом «лучший» не проходит проверку')
  const fixed = (await call('PATCH', `/campaigns/${c.id}`, { adText: 'Свежая обжарка у дома', budget: 20000 })).body
  assert.equal(fixed.moderation, null)
  assert.equal(fixed.forecast.amount, 20000)
  assert.equal((await call('POST', `/campaigns/${c.id}/submit`, {})).status, 400, 'без оферты нельзя')
  assert.equal((await call('POST', `/campaigns/${c.id}/submit`, { acceptOffer: true })).body.status, 'moderation')
  await sleep(4100)
  assert.equal((await call('GET', `/campaigns/${c.id}`)).body.status, 'live')
  await call('PATCH', '/session', { clock: 'd14' })
  const stats = (await call('GET', `/campaigns/${c.id}/stats`)).body
  assert.ok(stats.clicks > 0 && stats.daily.length === 14)
  const bal = (await call('GET', '/balance')).body
  assert.equal(bal.balance, 20000 + 3000 - stats.spent)
})

test('купон: сотрудник отправляет, руководитель подтверждает по ссылке, выплаты', async () => {
  await call('POST', '/session/reset')
  await call('POST', '/session/login', { provider: 'gos' })
  await call('PATCH', '/session', { role: 'staff' })
  const { body: c } = await call('POST', '/campaigns', { type: 'coupon' })
  assert.equal(c.forecast.amount, 0, 'купон без предоплаты')
  const sent = (await call('POST', `/campaigns/${c.id}/submit`, {})).body
  assert.equal(sent.status, 'approval')
  const a = (await call('POST', `/approvals/${sent.approvalToken}/confirm`, { provider: 'gos' })).body
  assert.equal(a.campaign.status, 'moderation')
  assert.equal(a.needsPay, false)
  await call('PATCH', '/session', { clock: 'd14' })
  const bal = (await call('GET', '/balance')).body
  assert.ok(bal.payout.due > 0 && bal.payout.fee > 0)
  assert.ok((await call('GET', '/documents')).body.some((d: { id: string }) => d.id === 'agent-11'))
})

test('ошибки по контракту', async () => {
  assert.equal((await call('GET', '/campaigns/99999')).status, 404)
  assert.equal((await call('POST', '/company/points', { addr: 'ул' })).status, 400)
  const co = (await call('GET', '/company')).body
  await call('PATCH', `/company/points/${co.points[0].id}`, { active: false })
  assert.equal((await call('PATCH', `/company/points/${co.points[1].id}`, { active: false })).status, 409, 'последнюю точку не выключить')
})
