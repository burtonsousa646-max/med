// Кампании от черновика до показа: оплата, проверка, маркировка, подтверждение руководителем, правки живой кампании.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from '../db.ts'
import { resetDb, client } from '../testing.ts'
import { runOutbox } from '../integrations/outbox.ts'
import { processHook } from '../integrations/hooks.ts'
import { stubState } from '../integrations/stubs.ts'

before(resetDb)
after(() => sql.end())

const drain = async () => { while (await runOutbox()); }

async function owner(inn: string) {
  const a = client()
  await a.loginPartner(inn)
  await drain()
  return a
}
async function topUp(a: ReturnType<typeof client>, amountKop: number, key: string) {
  const r = await (await a.req('/api/cabinet/payments', { method: 'POST', json: { amountKop, method: 'sbp', idempotencyKey: key } })).json()
  await processHook('payments', 'payment.succeeded', { paymentId: r.payment.id, amountKop }, `gw-${key}`)
}
const create = async (a: ReturnType<typeof client>, type = 'click') => (await a.req('/api/cabinet/campaigns', { method: 'POST', json: { type } })).json()
const patch = (a: ReturnType<typeof client>, id: number, json: unknown) => a.req(`/api/cabinet/campaigns/${id}`, { method: 'PATCH', json })
const get = async (a: ReturnType<typeof client>, id: number) => (await a.req(`/api/cabinet/campaigns/${id}`)).json()

test('справочник для сборки: типы, места, сигналы без непродаваемых', async () => {
  const a = await owner('7701111111')
  const cat = await (await a.req('/api/cabinet/catalog')).json()
  assert.equal(cat.offerTypes.length, 5)
  assert.ok(cat.placements.some((p: any) => p.id === 'showcase'))
  assert.ok(!cat.triggers.some((t: any) => t.id === 'stress'))
})

test('черновик: проверки полей, прогноз', async () => {
  const a = await owner('7701111111')
  const c = await create(a)
  assert.equal(c.status, 'draft')
  assert.equal(c.creative.status, 'draft')
  assert.equal((await patch(a, c.id, { placements: ['nope'] })).status, 422)
  assert.equal((await patch(a, c.id, { budgetMonthKop: 100 })).status, 422)
  assert.equal((await patch(a, c.id, { bidKop: 1 })).status, 422)
  assert.equal((await patch(a, c.id, { landingUrl: 'ftp://x' })).status, 422)
  assert.equal((await patch(a, c.id, { adText: 'x'.repeat(91) })).status, 422)
  assert.equal((await patch(a, c.id, { targeting: { signals: { stress: 'any' } } })).status, 422)
  assert.equal((await patch(a, c.id, { version: 99, name: 'x' })).status, 409)
  await a.req('/api/cabinet/company/points', { method: 'POST', json: { addr: 'ул. Покровка, 12' } })
  const ok = await (await patch(a, c.id, { landingUrl: 'https://example.ru', placements: ['showcase', 'paid'], budgetMonthKop: 1000000, targeting: { radiusM: 1000, signals: { live: 'any' } } })).json()
  assert.ok(ok.forecast.reach > 0 && ok.forecast.clicks > 0)
  assert.match(ok.trackingUrl, /click_id=\{click_id\}/)
})

test('руководитель: оферта, оплата недостающего, проверка, erid, показ', async () => {
  const a = await owner('7702222222')
  const c = await create(a)
  await patch(a, c.id, { landingUrl: 'https://example.ru', budgetMonthKop: 500000 })
  assert.equal((await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { idempotencyKey: 's1' } })).status, 422) // оферта
  const r = await (await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true, payMethod: 'sbp', idempotencyKey: 's1' } })).json()
  assert.equal(r.campaign.status, 'invoice')
  assert.equal(r.payment.payment.amountKop, '500000')
  assert.equal((await patch(a, c.id, { name: 'x' })).status, 409) // ждёт оплату — не правится

  await processHook('payments', 'payment.succeeded', { paymentId: r.payment.payment.id, amountKop: 500000 }, 'gw-s1')
  assert.equal((await get(a, c.id)).status, 'moderation')
  await drain()
  const live = await get(a, c.id)
  assert.equal(live.status, 'live')
  assert.match(live.liveCreative.erid, /^[1-9A-HJ-NP-Za-km-z]{11}$/)
  assert.ok(live.launchedAt)
  // ОРД: организация, договор, креатив — по одному разу
  const [{ n }] = await sql`select count(*)::int as n from external_refs where system = 'ord'`
  assert.equal(n, 2)
})

test('денег на балансе хватает — сразу на проверку; стоп-слово — отклонено, правка — снова проверка', async () => {
  const a = await owner('7703333333')
  await topUp(a, 1000000, 't1')
  const c = await create(a)
  await patch(a, c.id, { landingUrl: 'https://example.ru', adText: 'Лучший кофе в городе' })
  const r = await (await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true } })).json()
  assert.equal(r.payment, null)
  assert.equal(r.campaign.status, 'moderation')
  await drain()
  let cm = await get(a, c.id)
  assert.equal(cm.status, 'rejected')
  assert.match(cm.moderation.reason, /превосходная степень/)
  const [n] = await sql`select status from outbox where system = 'messaging' and payload->>'template' = 'creative_rejected'`
  assert.equal(n.status, 'done') // письмо уходит участникам с почтой; у этого владельца почты нет

  await patch(a, c.id, { adText: 'Свежая обжарка каждый день' })
  cm = await get(a, c.id)
  assert.deepEqual([cm.status, cm.creative.version], ['moderation', 2])
  await drain()
  assert.equal((await get(a, c.id)).status, 'live')
})

test('живая кампания: смысл не меняется, новый текст идёт на проверку, а показывается прошлый; пауза', async () => {
  const a = await owner('7704444444')
  await topUp(a, 1000000, 't2')
  const c = await create(a)
  await patch(a, c.id, { landingUrl: 'https://example.ru' })
  await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true } })
  await drain()
  assert.equal((await patch(a, c.id, { terms: { what: 'другое' } })).status, 409)
  await patch(a, c.id, { adText: 'Новое пиво к ужину' }) // алкоголь — ручная очередь
  await drain()
  let cm = await get(a, c.id)
  assert.deepEqual([cm.status, cm.creative.version, cm.creative.status, cm.liveCreative.version], ['live', 2, 'moderation', 1])

  const mod = client()
  await mod.loginStaff('moderator', 'mod@beeline.ru')
  const queue = await (await mod.req('/api/admin/moderation')).json()
  const task = queue.find((t: any) => t.campaignId === c.id)
  assert.ok(task)
  assert.equal((await mod.req(`/api/admin/moderation/${task.id}`, { method: 'POST', json: { verdict: 'rejected' } })).status, 422)
  await mod.req(`/api/admin/moderation/${task.id}`, { method: 'POST', json: { verdict: 'rejected', reason: 'реклама алкоголя в приложении не размещается' } })
  assert.equal((await mod.req(`/api/admin/moderation/${task.id}`, { method: 'POST', json: { verdict: 'approved' } })).status, 409)
  cm = await get(a, c.id)
  assert.deepEqual([cm.status, cm.creative.status, cm.liveCreative.version], ['live', 'rejected', 1])

  assert.equal((await (await patch(a, c.id, { paused: true })).json()).status, 'paused')
  assert.equal((await (await patch(a, c.id, { paused: false })).json()).status, 'live')
})

test('сотрудник отправляет руководителю: письмо, ссылка, подтверждение только подписантом', async () => {
  const boss = await owner('7705555555')
  await boss.req('/api/cabinet/company/invitations', { method: 'POST', json: { email: 'smm@example.ru', role: 'staff' } })
  const inv = stubState.messages.findLast(m => m.template === 'invitation')!.params.url.split('/invite/')[1]
  const smm = client()
  await smm.req('/api/auth/email/start', { method: 'POST', json: { email: 'smm@example.ru' } })
  await smm.req('/api/auth/email/verify', { method: 'POST', json: { email: 'smm@example.ru', code: stubState.messages.findLast(m => m.template === 'login_code')!.params.code } })
  await smm.req(`/api/auth/invitations/${inv}/accept`, { method: 'POST' })

  const c = await create(smm)
  await patch(smm, c.id, { landingUrl: 'https://example.ru' })
  const r = await (await smm.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { payMethod: 'invoice' } })).json()
  assert.equal(r.campaign.status, 'approval')
  const t = r.approvalUrl.split('/approve/')[1]
  assert.equal((await smm.req(`/api/cabinet/approvals/${t}`)).status, 403)
  assert.equal((await (await owner('7706666666')).req(`/api/cabinet/approvals/${t}`)).status, 404) // чужая компания

  assert.equal((await (await boss.req(`/api/cabinet/approvals/${t}`)).json()).id, c.id)
  const done = await (await boss.req(`/api/cabinet/approvals/${t}/confirm`, { method: 'POST', json: { acceptOffer: true, idempotencyKey: 'a1' } })).json()
  assert.equal(done.campaign.status, 'invoice')
  assert.match(done.payment.invoice.number, /^РП-/)
  assert.equal((await boss.req(`/api/cabinet/approvals/${t}/confirm`, { method: 'POST', json: { acceptOffer: true } })).status, 409)
})

test('купон: деньги не нужны — платит абонент; картинка креатива', async () => {
  const a = await owner('7707777777')
  const c = await create(a, 'coupon')
  assert.ok(c.creative.adText.includes('Купон'))
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const form = new FormData()
  form.append('file', new File([png], 'a.png', { type: 'image/png' }))
  const img = await (await a.req(`/api/cabinet/campaigns/${c.id}/image`, { method: 'POST', body: form })).json()
  assert.match(img.imageKey, /^creatives\//)
  await patch(a, c.id, { imageKey: img.imageKey })
  assert.equal((await a.req(img.imageUrl)).status, 200)
  assert.equal((await a.req('/api/files/documents/x')).status, 404)

  const r = await (await a.req(`/api/cabinet/campaigns/${c.id}/submit`, { method: 'POST', json: { acceptOffer: true } })).json()
  assert.equal(r.payment, null)
  await drain()
  assert.equal((await get(a, c.id)).status, 'live')
})
