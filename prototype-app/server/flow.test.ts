// Сквозная проверка контракта на тестовом сервере: npm test. Годится и для настоящего бэкенда —
// замените call() на fetch к его адресу.
import { test } from 'node:test'
import assert from 'node:assert/strict'
process.env.DB_PATH = ':memory:'
delete process.env.ANTHROPIC_API_KEY // ИИ-поиск в тестах идёт запасным путём, без платных вызовов
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
  const wide = (await call('PATCH', `/campaigns/${c.id}`, { wideCard: true })).body
  assert.equal(wide.wideCard, true)
  assert.equal(Math.round(wide.forecast.cpc * 100), Math.round(fixed.forecast.cpc * 130), 'широкая карточка: клик дороже на 30 %')
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

test('отслеживание: ссылка с click_id, ответ сервера партнёра, спор, CSV', async () => {
  await call('POST', '/session/reset')
  await call('POST', '/session/login', { provider: 'alfa' })
  const { body: c } = await call('POST', '/campaigns', { type: 'lead' })
  assert.match(c.trackingUrl, /utm_source=beeline.*click_id=\{click_id\}/)
  assert.equal((await call('PATCH', `/campaigns/${c.id}`, { landingUrl: 'не адрес' })).status, 400)
  await call('POST', `/campaigns/${c.id}/submit`, { acceptOffer: true })
  const seeded = (await call('GET', `/conversions?campaignId=${c.id}`)).body
  assert.equal(seeded.length, 3, 'заявки из формы в приложении')
  assert.ok(seeded.every((x: { status: string; disputeUntil: string }) => x.status === 'pending' && x.disputeUntil))

  const { key } = (await call('GET', '/tracking')).body
  const pb = (q: string) => call('GET', `/postback?${q}`)
  assert.equal((await pb(`key=wrong&click_id=bl${c.id}xabcdef`)).status, 401)
  assert.equal((await pb(`key=${key}&click_id=bl99999xabcdef`)).status, 404)
  const lead = (await pb(`key=${key}&click_id=bl${c.id}xabcdef&order_id=A1`)).body
  assert.equal(lead.status, 'pending')
  assert.equal((await pb(`key=${key}&click_id=bl${c.id}xabcdef&order_id=A1`)).body.id, lead.id, 'повтор не создаёт дубль')
  assert.equal((await pb(`key=${key}&click_id=bl${c.id}xabcdef&order_id=A1&status=approved`)).body.status, 'approved')
  assert.equal((await call('PATCH', `/conversions/${lead.id}`, { status: 'rejected' })).status, 409, 'решение уже принято')
  assert.equal((await call('PATCH', `/conversions/${seeded[0].id}`, { status: 'rejected', note: 'дубль' })).body.status, 'rejected')

  const res = await app.request('/api/conversions/import', { method: 'POST', headers: { cookie, 'content-type': 'text/csv' },
    body: `click_id;order_id;status;amount\nbl${c.id}x111111;B1;;\nbl${c.id}x111111;A1;returned;\nbl1x;C1;;\n` })
  const imp = await res.json()
  assert.deepEqual([imp.created, imp.updated, imp.errors.length], [1, 1, 1])
  assert.equal((await call('GET', '/tracking')).body.connected, true)
  assert.ok((await call('GET', `/campaigns/${c.id}`)).body.partnerEventAt, 'у кампании видно последнее событие от партнёра')
})

test('витрина: заявка абонента приходит в кабинет партнёра', async () => {
  await call('POST', '/session/reset')
  await call('POST', '/session/login', { provider: 'sber' })
  const { body: c } = await call('POST', '/campaigns', { type: 'lead' })
  assert.equal((await call('POST', `/showcase/${c.id}/act`)).status, 409, 'черновик на витрине не показывается')
  await call('POST', `/campaigns/${c.id}/submit`, { acceptOffer: true })
  await sleep(4100)
  const act = (await call('POST', `/showcase/${c.id}/act`)).body
  assert.ok(act.url.includes(`click_id=${act.clickId}`))
  assert.equal(act.conversion.source, 'form')
  assert.ok((await call('GET', `/conversions?campaignId=${c.id}`)).body.some((x: { id: number }) => x.id === act.conversion.id))
})

test('ИИ-поиск витрины: без ключа отвечает поиск по словам, проверка запроса и лимит', async () => {
  const offers = [
    { id: 'kolos', partner: 'пекарня «Колос»', title: 'завтрак: круассан и капучино за 199 ₽', small: 'круассан и капучино', cat: 'food', type: 'coupon', dist: 350, price: 199, till: 'ещё 2 дня', bee: true },
    { id: 'pena', partner: 'автомойка «Пена»', title: 'комплексная мойка −25%', small: 'на мойку в будни', cat: 'auto', type: 'promo', dist: 850, till: '30 ноября', bee: false },
  ]
  const context = { district: 'Хамовники', signals: [], viewed: [] }
  const ok = await call('POST', '/showcase/ask', { turns: [{ role: 'user', text: 'хочу капучино' }], offers, context })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.source, 'rules')
  assert.deepEqual(ok.body.offerIds, ['kolos'])
  assert.ok(ok.body.questions.length > 0, 'есть кнопки-уточнения')
  const none = (await call('POST', '/showcase/ask', { turns: [{ role: 'user', text: 'зоопарк' }], offers, context })).body
  assert.equal(none.offerIds[0], 'kolos', 'ничего не нашёл — показывает ближайшее')
  assert.equal((await call('POST', '/showcase/ask', { turns: [{ role: 'assistant', text: 'привет' }], offers, context })).status, 400, 'последний ход — абонента')
  let status = 200
  for (let i = 0; i < 20 && status === 200; i++) status = (await call('POST', '/showcase/ask', { turns: [{ role: 'user', text: 'мойка' }], offers, context })).status
  assert.equal(status, 429, 'не больше 20 вопросов за 10 минут')
})
