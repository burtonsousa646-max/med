import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import nodemailer, { type SendMailOptions } from 'nodemailer'
import { emptyCampaignDraft, type CampaignDraft } from '../shared/campaign-draft.ts'
import { createAutocomplete } from './autocomplete.ts'

process.env.DB_PATH = ':memory:'
const { app } = await import('./index.ts')
const { db } = await import('./db.ts')
const { savePartnerRegistry } = await import('./partner-registry.ts')
const { createV4Staff } = await import('./v4-staff.ts')
const { createCampaignEmail } = await import('./campaign-email.ts')
const { campaignCodeMessage, deliverCampaignMail, sendCampaignMail } = await import('./campaign-mail.ts')

const key = randomUUID()
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yFYcAAAAASUVORK5CYII=', 'base64')

async function send(method: string, revision: number, value: CampaignDraft, draftKey: string = key, code?: string) {
  const { offerImage, logoImage, ...fields } = value
  const body = new FormData()
  body.set('draft', JSON.stringify(fields))
  if (code) body.set('emailCode', code)
  if (offerImage) body.set('offerImage', offerImage)
  if (logoImage) body.set('logoImage', logoImage)
  return app.request('/api/v4/draft', { method, headers: { 'x-draft-key': draftKey, 'x-draft-revision': String(revision) }, body })
}

async function requestCode(draftKey: string, email: string, sendMail: (email: string, code: string) => Promise<void>) {
  return createCampaignEmail(sendMail).request('/draft/email', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-draft-key': draftKey }, body: JSON.stringify({ email }),
  })
}

async function confirmable(draft: CampaignDraft, draftKey: string, address: string) {
  draft.stage = draft.reached = 4
  assert.equal((await send('PUT', 3, draft, draftKey)).status, 200)
  let code = ''
  const capture = async (email: string, sentCode: string) => {
    assert.equal(email, address)
    code = sentCode
  }
  assert.equal((await requestCode(draftKey, address, capture)).status, 200)
  assert.match(code, /^\d{6}$/)
  assert.equal((await requestCode(draftKey, address, capture)).status, 429)
  draft.email = address
  return code
}

test('V4 stores partial drafts and files, accepts complete submissions once, and retries failed mail', async t => {
  const draft = emptyCampaignDraft()
  draft.business = { name: 'Тестовая кофейня', category: 'Кофе и завтраки', inn: '1234567894', phone: '+79000000001', city: 'Москва', website: 'https://example.test' }
  assert.equal((await send('PUT', 1, draft)).status, 400, 'No remote storage before acceptance')
  draft.offerAccepted = true
  draft.logoImage = new File(['html'], 'invalid.png', { type: 'image/png' })
  assert.equal((await send('PUT', 1, draft)).status, 400, 'Reject a forged image type')
  draft.offerImage = new File([new Uint8Array(png)], 'кофе.png', { type: 'image/png' })
  draft.logoImage = null
  draft.offer.layout = 'split'
  assert.equal((await send('PUT', 2, draft)).status, 200)
  assert.equal((await send('PUT', 1, { ...draft, triggers: 'Устаревшее пожелание' })).status, 200)
  const saved = db.prepare('select data from v4_drafts where id = ?').get(key) as { data: string }
  assert.equal(JSON.parse(saved.data).triggers, '')
  assert.equal(JSON.parse(saved.data).offer.layout, 'split')
  assert.equal(JSON.parse(saved.data).offerImage.base64, png.toString('base64'))
  assert.equal((await send('POST', 3, draft)).status, 400, 'Incomplete draft cannot create a submission')
  assert.equal((await send('PUT', 3, draft, 'invalid-key')).status, 400)
  assert.equal((await app.request('/api/v4/draft', { method: 'PUT', headers: { 'content-length': String(12 * 1024 * 1024) }, body: 'too large' })).status, 413)

  draft.confirmedInn = draft.business.inn
  draft.addresses = ['Тестовая, 1']
  draft.offer = { ...draft.offer, title: 'Загляните на завтрак', discount: '20' }
  draft.filled = true
  draft.stage = draft.reached = 3
  draft.triggers = 'Показывать утром'
  draft.audience[0] = 1
  draft.audienceCity = 'Казань'
  assert.equal((await send('POST', 4, draft)).status, 422, 'Completed application needs a confirmed email')
  const code = await confirmable(draft, key, 'partner@example.test')
  const provider = createAutocomplete({ token: () => 'fake', saveRegistry: savePartnerRegistry, request: async () => Response.json({
    suggestions: [{ data: {
      inn: draft.business.inn, name: { short_with_opf: 'ООО Пример', full_with_opf: 'Общество <Пример>' },
      state: { status: 'ACTIVE' }, kpp: '770101001', ogrn: '1234567890123', okved: '56.10',
      address: { value: 'Москва', data: { source: 'Юридическая улица, 1' } },
      management: { name: 'Иванов Иван Иванович', post: 'Директор' }, founders: [{ name: 'Лишнее поле' }],
    } }],
  }) })
  const lookup = await provider.request('/api/business/lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inn: draft.business.inn }),
  })
  assert.equal(lookup.status, 200)
  assert.equal((await lookup.json()).registryDetails, undefined)
  assert.equal((await send('POST', 4, { ...draft, partnerDetails: { bik: '123' } }, key, code)).status, 400)
  draft.partnerDetails = { bik: '044525225', account: '40702810000000000001', signer: 'Петров Пётр', signerAuthority: 'Доверенность' }
  const forged = { ...draft, registryDetails: { legalName: 'Подмена' } }
  const wrong = code === '000000' ? '000001' : '000000'
  assert.equal((await send('POST', 4, { ...draft, email: 'other@example.test' }, key, code)).status, 422)
  assert.equal((await send('POST', 4, draft, randomUUID(), code)).status, 422)
  assert.equal((await send('POST', 4, draft, key, wrong)).status, 422)
  const results = await Promise.all([send('POST', 4, forged, key, code), send('POST', 5, draft, key, code)])
  assert.equal((await send('POST', 6, { ...draft, triggers: 'Другие пожелания' }, key, code)).status, 422)
  assert.deepEqual(results.map(res => res.status).sort(), [200, 201])
  const [first, second] = await Promise.all(results.map(res => res.json() as Promise<{ id: string; status: string }>))
  assert.deepEqual(first, second)
  assert.equal(first.status, 'accepted')
  assert.equal(db.prepare('select count(*) as n from v4_submissions').get()?.n, 1)

  const record = JSON.parse(String(db.prepare('select data from v4_submissions where id = ?').get(first.id)?.data))
  assert.equal(record.registryDetails.legalName, 'Общество <Пример>')
  assert.equal(record.registryDetails.legalAddress, 'Юридическая улица, 1')
  assert.equal(record.registryDetails.founders, undefined)
  assert.deepEqual(record.partnerDetails, draft.partnerDetails)
  savePartnerRegistry(draft.business.inn, null)

  const employee = 'staff@example.test'
  let staffCode = ''
  const staff = createV4Staff({ addresses: [employee], administrators: [] }, async (_, value) => { staffCode = value })
  const staffPost = (path: string, body: object) => staff.request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const detailUrl = '/submissions/' + first.id
  assert.equal((await staff.request(detailUrl)).status, 401)
  assert.equal((await staffPost('/code', { email: employee })).status, 200)
  const login = await staffPost('/verify', { email: employee, code: staffCode })
  assert.equal(login.status, 200)
  const result = await staff.request(detailUrl, { headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] } })
  assert.equal(result.status, 200)
  const detail = await result.json()
  assert.deepEqual(detail.registryDetails, record.registryDetails)
  assert.deepEqual(detail.partnerDetails, draft.partnerDetails)

  const now = Date.now()
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const smtp = t.mock.fn((message: SendMailOptions) => transport.sendMail(message))
  smtp.mock.mockImplementationOnce(async () => { throw new Error('SMTP unavailable') })
  const sendMail = (row: Parameters<typeof sendCampaignMail>[0]) => sendCampaignMail(row, 'sender@example.test', smtp)
  await deliverCampaignMail(sendMail, now)
  assert.equal(db.prepare('select mail_sent_at from v4_submissions').get()?.mail_sent_at, null)
  await deliverCampaignMail(sendMail, now + 59_999)
  assert.equal(smtp.mock.callCount(), 1, 'Retry must wait for the scheduled time')
  await deliverCampaignMail(sendMail, now + 60_000)
  assert.equal(smtp.mock.callCount(), 2)
  const [initial, retried] = smtp.mock.calls
  assert.deepEqual(retried.arguments[0], initial.arguments[0])
  const [message] = retried.arguments
  assert.equal(message.subject, 'Новая заявка на рекламную кампанию · партнерская платформа билайн')
  assert.match(String(message.text), /партнерская платформа билайн$/)
  assert.match(String(message.text), /ИНН: 1234567894/)
  assert.match(String(message.text), /КПП: 770101001/)
  assert.match(String(message.text), /Руководитель по реестру: Иванов Иван Иванович/)
  assert.match(String(message.text), /Расчётный счёт: 40702810000000000001/)
  assert.match(String(message.text), /Корреспондентский счёт: Не указано/)
  assert.match(String(message.text), /Подтверждённый email: partner@example.test/)
  assert.match(String(message.text), /Показывать утром/)
  assert.match(String(message.text), /Город бизнеса: Москва/)
  assert.match(String(message.text), /Город показа: Казань/)
  const email = await retried.result
  assert.equal(email?.messageId, `<v4-campaign-${first.id}@example.test>`)
  assert.deepEqual(email?.envelope, { from: 'sender@example.test', to: ['beepartners@beeline.ru'] })
  assert.match(String(email?.message), /Content-Disposition: attachment; filename=offer\.png/)
  assert.ok(String(email?.message).replaceAll('\r\n', '').includes(png.toString('base64')))
  assert.equal(typeof db.prepare('select mail_sent_at from v4_submissions').get()?.mail_sent_at, 'number')
  await deliverCampaignMail(sendMail, now + 120_000)
  assert.equal(smtp.mock.callCount(), 2, 'Accepted mail must leave the queue')
  assert.equal((await send('POST', 6, draft, key, wrong)).status, 422)
  assert.equal((await send('POST', 6, draft, key, code)).status, 200)
  assert.equal(db.prepare('select count(*) as n from v4_submissions').get()?.n, 1)
})

test('V4 sends two large attachments together and completes older partially sent submissions', async t => {
  const draft = emptyCampaignDraft()
  draft.business = { name: 'Тестовая кофейня', category: 'Кофе', inn: '1234567894', phone: '+79000000001', city: '', website: '' }
  draft.online = true
  draft.offerAccepted = true
  draft.confirmedInn = draft.business.inn
  draft.offer.title = 'Загляните на завтрак'
  draft.filled = true
  draft.stage = draft.reached = 3
  const largeImage = new Uint8Array(5 * 1024 * 1024)
  largeImage.set(png)
  draft.offerImage = new File([largeImage], 'offer.png', { type: 'image/png' })
  draft.logoImage = new File([largeImage], 'logo.png', { type: 'image/png' })
  const draftKey = randomUUID()
  const code = await confirmable(draft, draftKey, 'attachments@example.test')
  const response = await send('POST', 4, draft, draftKey, code)
  assert.equal(response.status, 201)
  const { id } = await response.json() as { id: string }
  const prior = db.prepare('select data, submitted_at from v4_submissions where id = ?').get(id) as { data: string; submitted_at: number }
  const older = { id: randomUUID() }
  const legacy = { ...JSON.parse(prior.data), registryDetails: undefined, email: undefined, stage: 4, reached: 4 }
  db.prepare('insert into v4_submissions (id, draft_id, digest, data, submitted_at, mail_next_at) values (?, ?, ?, ?, ?, ?)')
    .run(older.id, randomUUID(), 'legacy', JSON.stringify(legacy), prior.submitted_at, prior.submitted_at)
  db.prepare('insert into v4_mail_parts (submission_id, part) values (?, 1)').run(older.id)
  const smtp = t.mock.fn(async (_message: SendMailOptions) => {})
  const now = Date.now()
  const sendMail = (row: Parameters<typeof sendCampaignMail>[0]) => sendCampaignMail(row, 'sender@example.test', smtp)
  await deliverCampaignMail(sendMail, now)
  await deliverCampaignMail(sendMail, now)
  assert.equal(smtp.mock.callCount(), 2)
  const messages = smtp.mock.calls.map(({ arguments: [message] }) => message)
  const complete = messages.find(message => message.messageId === `<v4-campaign-${id}@example.test>`)
  const remaining = messages.find(message => message.messageId === `<v4-campaign-${older.id}-2@example.test>`)
  assert.deepEqual(complete?.attachments?.map(file => file.filename), ['offer.png', 'logo.png'])
  assert.deepEqual(remaining?.attachments?.map(file => file.filename), ['logo.png'])
  assert.match(remaining?.text?.toString() ?? '', /Нет снимка реестра/)
  assert.match(remaining?.subject ?? '', /\(2\/2\)$/)
  assert.ok(complete?.attachments?.every(file => Buffer.isBuffer(file.content) && file.content.equals(largeImage)))
  assert.equal(db.prepare('select count(*) as n from v4_submissions where id in (?, ?) and mail_sent_at is not null').get(id, older.id)?.n, 2)
})

test('V4 email code expires and is blocked after five wrong attempts', async () => {
  const draft = emptyCampaignDraft()
  draft.business = { name: 'Кофейня', category: 'Кофе', inn: '1234567894', phone: '+79000000001', city: '', website: '' }
  draft.online = true
  draft.offerAccepted = true
  draft.confirmedInn = draft.business.inn
  draft.offer.title = 'Загляните на завтрак'
  draft.filled = true
  const draftKey = randomUUID()
  const code = await confirmable(draft, draftKey, 'attempts@example.test')
  const wrong = code === '111111' ? '222222' : '111111'
  for (let i = 0; i < 5; i++) assert.equal((await send('POST', 4, draft, draftKey, wrong)).status, 422)
  assert.equal((await send('POST', 4, draft, draftKey, code)).status, 422)

  const expiredKey = randomUUID()
  const expired = await confirmable(draft, expiredKey, 'expires@example.test')
  db.prepare('update v4_email_codes set sent_at = ? where draft_id = ?').run(Date.now() - 600_001, expiredKey)
  assert.equal((await send('POST', 4, draft, expiredKey, expired)).status, 422)
})

test('V4 verification email uses the public partner platform name', () => {
  const message = campaignCodeMessage('partner@example.test', '012345', 'sender@example.test')
  assert.equal(message.from.name, 'партнерская платформа билайн')
  assert.equal(message.subject, 'Код подтверждения почты · партнерская платформа билайн')
  assert.match(message.text, /партнерская платформа билайн$/)
})
