import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { Hono } from 'hono'
import { emptyCampaignDraft } from '../shared/campaign-draft.ts'

process.env.DB_PATH = ':memory:'
const { app: productionRouter } = await import('./index.ts')
const { db } = await import('./db.ts')
const { createV4Staff } = await import('./v4-staff.ts')
const { savePartnerRegistry } = await import('./partner-registry.ts')

const allowed = 'staff@example.test'
const attachment = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yFYcAAAAASUVORK5CYII=', 'base64')
const save = db.prepare('insert into v4_submissions (id, draft_id, digest, data, submitted_at, mail_next_at) values (?, ?, ?, ?, ?, ?)')

function setup(lookupRegistry?: (inn: string) => Promise<Response>) {
  let clock = Date.now()
  const messages: { email: string; code: string }[] = []
  const app = new Hono().route('/api/v4/staff', createV4Staff({ addresses: [allowed, 'another@example.test'], administrators: ['admin@example.test'], lookupRegistry }, async (email, code) => { messages.push({ email, code }) }, () => clock))
  const call = (path: string, body?: object, cookie?: string) =>
    app.request('/api/v4/staff' + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
      body: body && JSON.stringify(body),
    })
  return { call, messages, advance: (ms: number) => { clock += ms } }
}

test('staff list, submission and assets require an allowlisted employee session', async () => {
  const { call, messages } = setup()
  const id = randomUUID()
  const record = {
    ...emptyCampaignDraft(), email: 'partner@example.test', business: {
      name: 'Кофейня Зерно', category: 'Кофе', inn: '1234567894', phone: '+79000000001', city: 'Москва', website: '',
    }, addresses: ['Покровка, 12'], audienceCity: 'Казань', audience: [1, 0, 0, 0, 0], triggers: 'После оплаты', offerAccepted: true,
    offer: { ...emptyCampaignDraft().offer, title: 'Скидка на кофе', promo: 'COFFEE' },
    offerImage: { name: 'кофе.png', type: 'image/png', base64: attachment.toString('base64') },
  }
  save.run(id, randomUUID(), 'submission', JSON.stringify(record), 1700000000000, 1700000000000)
  assert.equal((await call('/submissions/search', {})).status, 401)
  assert.equal((await call('/submissions/' + id)).status, 401)
  assert.equal((await call('/submissions/' + id + '/offer-image')).status, 401)
  assert.equal((await call('/code', { email: 'partner@example.test' })).status, 200)
  assert.equal(messages.length, 0)
  assert.equal((await call('/verify', { email: 'partner@example.test', code: '123456' })).status, 401)

  assert.equal((await call('/code', { email: 'STAFF@example.test' })).status, 200)
  assert.equal((await call('/code', { email: allowed })).status, 200)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].email, allowed)
  const { code } = messages[0]
  assert.equal((await call('/verify', { email: allowed, code: code === '000000' ? '000001' : '000000' })).status, 401)
  const login = await call('/verify', { email: allowed, code })
  assert.equal(login.status, 200)
  const set = login.headers.get('set-cookie') ?? ''
  assert.match(set, /HttpOnly/i)
  assert.match(set, /SameSite=Strict/i)
  assert.match(set, /Path=\/api\/v4\/staff/i)
  assert.equal(login.headers.get('cache-control'), 'private, no-store')
  const session = set.split(';')[0]
  assert.equal((await call('/verify', { email: allowed, code })).status, 401)
  assert.equal((await call('/session', undefined, session)).status, 200)

  const list = await call('/submissions/search', { query: 'ЗЕРНО', page: 1 }, session)
  const items = await list.json()
  assert.equal(items.total, 1)
  assert.deepEqual(items.items.map((item: { id: string }) => item.id), [id])
  assert.equal(items.items[0].title, record.offer.title)
  assert.equal(items.items[0].offerImage, undefined)
  assert.equal((await (await call('/submissions/search', { query: 'Не найдено' }, session)).json()).total, 0)
  const detail = await (await call('/submissions/' + id, undefined, session)).json()
  assert.deepEqual(detail.business, record.business)
  assert.equal(detail.email, record.email)
  assert.equal(detail.audienceCity, record.audienceCity)
  assert.equal(detail.triggers, record.triggers)
  assert.equal(detail.offer.promo, record.offer.promo)
  assert.equal(detail.offerImage, 'кофе.png')
  const asset = await call('/submissions/' + id + '/offer-image?download=1', undefined, session)
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get('cache-control'), 'private, no-store')
  assert.equal(asset.headers.get('content-type'), 'image/png')
  assert.match(asset.headers.get('content-disposition') ?? '', /^attachment;/)
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), attachment)
  assert.equal((await call('/submissions/' + id + '/logo', undefined, session)).status, 404)

  assert.equal((await productionRouter.request('/api/v4/staff/session', { headers: { Cookie: session } })).status, 401)
  assert.equal((await call('/logout', {}, session)).status, 200)
  assert.equal((await call('/submissions/search', {}, session)).status, 401)
})

test('staff can retry a missing registry snapshot and reuse it without changing the original application', async () => {
  const inn = '7707083893'
  const snapshot = {legalName:'Тестовая компания', kpp:'770701001', ogrn:'1027700132195', legalAddress:'Москва',
    manager:'Руководитель', managerRole:'Директор', okved:'64.19', checkedAt:Date.now(), requiresReview:false}
  const id = randomUUID(), second = randomUUID()
  const original = {...emptyCampaignDraft(), business:{...emptyCampaignDraft().business, inn}, partnerDetails:{signer:'Подписант'}}
  for (const uuid of [id, second]) save.run(uuid, randomUUID(), 'submission', JSON.stringify(original), Date.now(), Date.now())
  let attempts = 0
  const { call, messages } = setup(async query => {
    assert.equal(query, inn)
    if (++attempts === 1) return new Response(null, {status:502})
    savePartnerRegistry(query, snapshot)
    return new Response(null, {status:200})
  })
  const path = '/submissions/' + id
  assert.equal((await call(path + '/registry', {})).status, 401)
  const email = 'admin@example.test'
  await call('/code', { email })
  const login = await call('/verify', { email, code:messages[0].code })
  const session = login.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await call(path + '/registry', {}, session)).status, 503)
  assert.ok(!(await (await call(path, undefined, session)).json()).registryDetails)
  const lookup = () => call(path + '/registry', { inn:'1234567894' }, session)
  assert.deepEqual(await (await lookup()).json(), snapshot)
  assert.deepEqual(await (await call('/submissions/' + second + '/registry', {}, session)).json(), snapshot)
  savePartnerRegistry(inn, null)
  assert.deepEqual(await (await lookup()).json(), snapshot)
  assert.equal(attempts, 2)
  const row = db.prepare('select data from v4_submissions where id = ?').get(id) as {data:string}
  assert.deepEqual(JSON.parse(row.data), {...JSON.parse(JSON.stringify(original)), registryDetails:snapshot})
  await call('/logout', {}, session)
  db.prepare('delete from v4_staff_codes where email = ?').run(email)
})

test('staff codes expire and failed attempts exhaust the code', async () => {
  const { call, messages, advance } = setup()
  const email = 'another@example.test'
  await call('/code', { email })
  const initial = messages[0].code
  advance(10 * 60_000)
  assert.equal((await call('/verify', { email, code: initial })).status, 401)
  await call('/code', { email })
  const renewed = messages[1].code
  const wrong = renewed === '111111' ? '222222' : '111111'
  for (let i = 0; i < 5; i++) assert.equal((await call('/verify', { email, code: wrong })).status, 401)
  assert.equal((await call('/verify', { email, code: renewed })).status, 401)
  advance(60_000)
  await call('/code', { email })
  const response = await call('/verify', { email, code: messages[2].code })
  const session = (response.headers.get('set-cookie') ?? '').split(';')[0]
  assert.equal(response.status, 200)
  advance(8 * 60 * 60_000)
  assert.equal((await call('/session', undefined, session)).status, 401)
})

test('only the administrator can list and add employees, and added employees can sign in', async () => {
  const { call, messages, advance } = setup()
  const admin = 'admin@example.test'
  const newEmail = 'new-staff@example.test'
  async function login(email: string) {
    const before = messages.length
    assert.equal((await call('/code', { email })).status, 200)
    assert.equal(messages.length, before + 1)
    const response = await call('/verify', { email, code: messages.at(-1)!.code })
    assert.equal(response.status, 200)
    return { cookie: (response.headers.get('set-cookie') ?? '').split(';')[0], staff: await response.json() }
  }

  assert.equal((await call('/team')).status, 401)
  advance(61_000)
  const employee = await login(allowed)
  assert.equal(employee.staff.role, 'staff')
  assert.equal((await call('/team', undefined, employee.cookie)).status, 403)
  assert.equal((await call('/team', { email: newEmail }, employee.cookie)).status, 403)

  const owner = await login(admin)
  assert.equal(owner.staff.role, 'admin')
  assert.equal((await call('/team', { email: 'invalid' }, owner.cookie)).status, 400)
  assert.equal((await call('/team', { email: newEmail.toUpperCase(), role: 'admin' }, owner.cookie)).status, 201)
  assert.equal((await call('/team', { email: newEmail }, owner.cookie)).status, 409)
  assert.equal((await call('/team', { email: admin }, owner.cookie)).status, 409)
  const { members } = await (await call('/team', undefined, owner.cookie)).json()
  assert.equal(members.find((member: { email: string }) => member.email === newEmail).addedBy, admin)
  assert.equal(members.find((member: { email: string }) => member.email === admin).role, 'admin')

  const added = await login(newEmail)
  assert.equal(added.staff.role, 'staff')
  assert.equal((await call('/submissions/search', {}, added.cookie)).status, 200)
  assert.equal((await call('/team', { email: 'someone@example.test' }, added.cookie)).status, 403)
})
