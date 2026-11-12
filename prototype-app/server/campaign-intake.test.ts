import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import nodemailer, { type SendMailOptions } from 'nodemailer'
import { emptyCampaignDraft, type CampaignDraft } from '../shared/campaign-draft.ts'

process.env.DB_PATH = ':memory:'
const { app } = await import('./index.ts')
const { db } = await import('./db.ts')
const { deliverCampaignMail, sendCampaignMail } = await import('./campaign-mail.ts')

const key = randomUUID()
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yFYcAAAAASUVORK5CYII=', 'base64')

async function send(method: string, revision: number, value: CampaignDraft, draftKey: string = key) {
  const { offerImage, logoImage, ...fields } = value
  const body = new FormData()
  body.set('draft', JSON.stringify(fields))
  if (offerImage) body.set('offerImage', offerImage)
  if (logoImage) body.set('logoImage', logoImage)
  return app.request('/api/v4/draft', { method, headers: { 'x-draft-key': draftKey, 'x-draft-revision': String(revision) }, body })
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
  const results = await Promise.all([send('POST', 4, draft), send('POST', 5, draft)])
  assert.deepEqual(results.map(res => res.status).sort(), [200, 201])
  const [first, second] = await Promise.all(results.map(res => res.json() as Promise<{ id: string; status: string }>))
  assert.deepEqual(first, second)
  assert.equal(first.status, 'accepted')
  assert.equal(db.prepare('select count(*) as n from v4_submissions').get()?.n, 1)

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
  assert.match(String(message.text), /ИНН: 1234567894/)
  assert.match(String(message.text), /Показывать утром/)
  const email = await retried.result
  assert.equal(email?.messageId, `<v4-campaign-${first.id}@example.test>`)
  assert.deepEqual(email?.envelope, { from: 'sender@example.test', to: ['beepartners@beeline.ru'] })
  assert.match(String(email?.message), /Content-Disposition: attachment; filename=offer\.png/)
  assert.ok(String(email?.message).replaceAll('\r\n', '').includes(png.toString('base64')))
  assert.equal(typeof db.prepare('select mail_sent_at from v4_submissions').get()?.mail_sent_at, 'number')
  await deliverCampaignMail(sendMail, now + 120_000)
  assert.equal(smtp.mock.callCount(), 2, 'Accepted mail must leave the queue')
  assert.equal((await send('POST', 6, draft)).status, 200)
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
  const response = await send('POST', 1, draft, randomUUID())
  assert.equal(response.status, 201)
  const { id } = await response.json() as { id: string }
  const olderResponse = await send('POST', 1, draft, randomUUID())
  assert.equal(olderResponse.status, 201)
  const older = await olderResponse.json() as { id: string }
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
  assert.match(remaining?.subject ?? '', /\(2\/2\)$/)
  assert.ok(complete?.attachments?.every(file => Buffer.isBuffer(file.content) && file.content.equals(largeImage)))
  assert.equal(db.prepare('select count(*) as n from v4_submissions where id in (?, ?) and mail_sent_at is not null').get(id, older.id)?.n, 2)
})
