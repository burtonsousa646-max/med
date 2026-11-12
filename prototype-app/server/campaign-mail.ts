import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { audienceGroups } from '../shared/campaign-draft.ts'
import { offerLayouts } from '../shared/campaign-offer.ts'
import { imageExtension, type IntakeData } from './campaign-intake.ts'
import { db } from './db.ts'

type MailRow = { id: string; data: string; submitted_at: number; mail_attempts: number }
const recipient = 'beepartners@beeline.ru'

const credentialName = 'ads-proto-unisender-go-api-key'
const maxRequestBytes = 10_000_000
const acceptedPart = db.prepare('select 1 from v4_mail_parts where submission_id = ? and part = ?')
const markPartAccepted = db.prepare('insert into v4_mail_parts (submission_id, part) values (?, ?)')

function campaignMessage(row: MailRow, from: string) {
  const { business, addresses, online, offer, audience, triggers, offerImage, logoImage } = JSON.parse(row.data) as IntakeData
  return {
    from_email: from,
    recipients: [{ email: recipient }],
    subject: 'Новая заявка на рекламную кампанию МЁД',
    template_engine: 'none',
    // shortcut: Unisender Go deduplicates for one minute; reconcile ambiguous sends if duplicates must be ruled out.
    idempotence_key: `v4-campaign-${row.id}`,
    body: { plaintext: [
      `Заявка ${row.id}`, `Дата: ${new Date(row.submitted_at).toISOString()}`, '',
      `Название: ${business.name}`, `ИНН: ${business.inn}`, `Телефон: ${business.phone}`, `Сфера: ${business.category}`,
      `Сайт: ${business.website || '—'}`, `Город: ${business.city || '—'}`,
      `Работает онлайн: ${online ? 'да' : 'нет'}`, `Адреса: ${addresses.filter(Boolean).join('; ') || '—'}`, '',
      `Оффер: ${offer.title}`, `Промокод: ${offer.promo || '—'}`, `Скидка: ${offer.discount ? offer.discount + '%' : '—'}`,
      `Срок действия: ${offer.until || '—'}`, `Цвет: ${offer.tone}`, `Акция 1 + 1: ${offer.gift ? 'да' : 'нет'}`,
      `Увеличенный креатив: ${offer.zoom ? 'да' : 'нет'}`, `Макет: ${offer.layout ? offerLayouts[offer.layout] : 'Автоматически'}`, '',
      ...audienceGroups.map(({ title, choices }, i) => `${title}: ${choices[audience[i]]}`),
      `Пожелания: ${triggers || '—'}`, 'Условия оферты приняты.',
    ].join('\n') },
    attachments: [{ file: offerImage, label: 'offer' }, { file: logoImage, label: 'logo' }].flatMap(({ file, label }) => file ? [{
      name: `${label}.${imageExtension(file.type)}`, type: file.type, content: file.base64,
    }] : []),
  }
}

async function sendUnisenderMail(body: string, apiKey: string) {
  if (Buffer.byteLength(body) > maxRequestBytes) throw new Error('Unisender Go request exceeds 10 MB')
  const response = await fetch('https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json', {
    method: 'POST',
    redirect: 'error',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Unisender Go rejected campaign email (HTTP ${response.status})`)
  }
  const result = await response.json() as {
    status?: string; job_id?: string; emails?: string[]; failed_emails?: Record<string, string>
  } | null
  if (result?.status !== 'success' || typeof result.job_id !== 'string' || !result.job_id
    || (result.failed_emails && Object.hasOwn(result.failed_emails, recipient))
    || (result.emails !== undefined && (!Array.isArray(result.emails) || !result.emails.includes(recipient)))) {
    throw new Error('Unisender Go did not accept the campaign email')
  }
}

export async function sendCampaignMail(row: MailRow, from: string, apiKey: string) {
  const message = campaignMessage(row, from)
  const body = JSON.stringify({ message })
  if (Buffer.byteLength(body) <= maxRequestBytes || message.attachments.length < 2) {
    await sendUnisenderMail(body, apiKey)
    return
  }

  for (const [index, attachment] of message.attachments.entries()) {
    const part = index + 1
    if (acceptedPart.get(row.id, part)) continue
    await sendUnisenderMail(JSON.stringify({ message: {
      ...message,
      subject: `${message.subject} (${part}/${message.attachments.length})`,
      idempotence_key: `${message.idempotence_key}-${part}`,
      attachments: [attachment],
    } }), apiKey)
    markPartAccepted.run(row.id, part)
  }
}

// Claim with a lease so two worker processes cannot send the same queued entry at once.
const claimMail = db.prepare(`
  update v4_submissions set mail_attempts = mail_attempts + 1, mail_next_at = ?
  where id = (select id from v4_submissions where mail_sent_at is null and mail_next_at <= ? order by mail_next_at limit 1)
  returning id, data, submitted_at, mail_attempts
`)
const markSent = db.prepare('update v4_submissions set mail_sent_at = ? where id = ?')
const retry = db.prepare('update v4_submissions set mail_next_at = ? where id = ?')

export async function deliverCampaignMail(send: (row: MailRow) => Promise<void>, now = Date.now()) {
  const row = claimMail.get(now + 10 * 60_000, now) as MailRow | undefined
  if (!row) return
  try { await send(row) }
  catch {
    const delay = Math.min(60, 2 ** Math.min(row.mail_attempts - 1, 6)) * 60_000
    retry.run(now + delay, row.id)
    console.warn('V4 campaign email failed; retry queued')
    return
  }
  markSent.run(Date.now(), row.id)
}

export function startCampaignMail() {
  const { CAMPAIGN_MAIL_FROM: from, UNISENDER_GO_API_KEY_FILE, CREDENTIALS_DIRECTORY } = process.env
  const keyPath = UNISENDER_GO_API_KEY_FILE || (CREDENTIALS_DIRECTORY && join(CREDENTIALS_DIRECTORY, credentialName))
  let apiKey = ''
  try {
    if (keyPath) apiKey = readFileSync(keyPath, 'utf8').trim()
  } catch {
    console.warn('V4 campaign email is queued: Unisender Go credential file could not be read')
    return () => {}
  }
  if (!/^\S+$/.test(apiKey) || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) {
    console.warn('V4 campaign email is queued: configure the Unisender Go credential and CAMPAIGN_MAIL_FROM')
    return () => {}
  }
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await deliverCampaignMail(row => sendCampaignMail(row, from, apiKey))
    } catch { console.error('V4 campaign mail queue error') }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 5000)
  void tick()
  return () => clearInterval(timer)
}
