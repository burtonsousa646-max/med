import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import nodemailer from 'nodemailer'
import { emptyCampaignDraft, type CampaignDraft } from '../shared/campaign-draft.ts'

process.env.DB_PATH = ':memory:'
const { app } = await import('./index.ts')
const { db } = await import('./db.ts')
const { campaignMessage, deliverCampaignMail } = await import('./campaign-mail.ts')

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

test('V4 stores partial drafts and files, accepts complete submissions once, and retries mail', async () => {
  const draft = emptyCampaignDraft()
  draft.business = { name: 'Тестовая кофейня', category: 'Кофе и завтраки', inn: '1234567894', phone: '+79000000001', city: 'Москва', website: 'https://example.test' }
  assert.equal((await send('PUT', 1, draft)).status, 400, 'No remote storage before acceptance')
  draft.offerAccepted = true
  draft.logoImage = new File(['html'], 'invalid.png', { type: 'image/png' })
  assert.equal((await send('PUT', 1, draft)).status, 400, 'Reject a forged image type')
  draft.offerImage = new File([new Uint8Array(png)], 'кофе.png', { type: 'image/png' })
  draft.logoImage = null
  assert.equal((await send('PUT', 2, draft)).status, 200)
  assert.equal((await send('PUT', 1, { ...draft, triggers: 'Устаревшее пожелание' })).status, 200)
  const saved = db.prepare('select data from v4_drafts where id = ?').get(key) as { data: string }
  assert.equal(JSON.parse(saved.data).triggers, '')
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
  await deliverCampaignMail(async () => { throw new Error('SMTP unavailable') }, now)
  assert.equal(db.prepare('select mail_sent_at from v4_submissions').get()?.mail_sent_at, null)
  await deliverCampaignMail(async () => assert.fail('Retry must wait for the scheduled time'), now + 59_999)
  let sent = 0
  await deliverCampaignMail(async row => {
    const message = campaignMessage(row, 'sender@example.test')
    assert.equal(message.to, 'beepartners@beeline.ru')
    assert.match(message.text, /ИНН: 1234567894/)
    assert.match(message.text, /Показывать утром/)
    assert.deepEqual(message.attachments[0].content, png)
    const rendered = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(message)
    assert.match(String(rendered.message), /To: beepartners@beeline\.ru/)
    assert.match(String(rendered.message), /filename=offer\.png/)
    sent++
  }, now + 60_000)
  assert.equal(sent, 1)
  assert.equal(typeof db.prepare('select mail_sent_at from v4_submissions').get()?.mail_sent_at, 'number')
  assert.equal((await send('POST', 6, draft)).status, 200)
  assert.equal(db.prepare('select count(*) as n from v4_submissions').get()?.n, 1)
})
