import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type SendMailOptions } from 'nodemailer'
import { audienceGroups } from '../shared/campaign-draft.ts'
import { offerLayouts } from '../shared/campaign-offer.ts'
import { imageExtension, type IntakeData } from './campaign-intake.ts'
import { db } from './db.ts'

type MailRow = { id: string; data: string; submitted_at: number; mail_attempts: number }
const recipient = 'beepartners@beeline.ru'

const credentialName = 'ads-proto-smtp-password'
const acceptedPart = db.prepare('select 1 from v4_mail_parts where submission_id = ? and part = ?')
const markPartAccepted = db.prepare('insert into v4_mail_parts (submission_id, part) values (?, ?)')

function campaignMessage(row: MailRow, from: string) {
  const { business, addresses, online, offer, audience, triggers, offerImage, logoImage } = JSON.parse(row.data) as IntakeData
  return {
    from,
    to: recipient,
    subject: 'Новая заявка на рекламную кампанию МЁД',
    // shortcut: SMTP can accept a message before a connection drops; reconcile ambiguous deliveries if duplicates must be ruled out.
    messageId: `<v4-campaign-${row.id}@${from.split('@')[1]}>`,
    text: [
      `Заявка ${row.id}`, `Дата: ${new Date(row.submitted_at).toISOString()}`, '',
      `Название: ${business.name}`, `ИНН: ${business.inn}`, `Телефон: ${business.phone}`, `Сфера: ${business.category}`,
      `Сайт: ${business.website || '—'}`, `Город: ${business.city || '—'}`,
      `Работает онлайн: ${online ? 'да' : 'нет'}`, `Адреса: ${addresses.filter(Boolean).join('; ') || '—'}`, '',
      `Оффер: ${offer.title}`, `Промокод: ${offer.promo || '—'}`, `Скидка: ${offer.discount ? offer.discount + '%' : '—'}`,
      `Срок действия: ${offer.until || '—'}`, `Цвет: ${offer.tone}`, `Акция 1 + 1: ${offer.gift ? 'да' : 'нет'}`,
      `Увеличенный креатив: ${offer.zoom ? 'да' : 'нет'}`, `Макет: ${offer.layout ? offerLayouts[offer.layout] : 'Автоматически'}`, '',
      ...audienceGroups.map(({ title, choices }, i) => `${title}: ${choices[audience[i]]}`),
      `Пожелания: ${triggers || '—'}`, 'Условия оферты приняты.',
    ].join('\n'),
    attachments: [{ file: offerImage, label: 'offer' }, { file: logoImage, label: 'logo' }].flatMap(({ file, label }) => file ? [{
      filename: `${label}.${imageExtension(file.type)}`, contentType: file.type, content: Buffer.from(file.base64, 'base64'),
    }] : []),
  }
}

export async function sendCampaignMail(row: MailRow, from: string, send: (message: SendMailOptions) => Promise<unknown>) {
  const message = campaignMessage(row, from)
  // Finish partially sent submissions from the old transport without resending accepted parts.
  if (message.attachments.length !== 2 || ![1, 2].some(part => acceptedPart.get(row.id, part))) {
    await send(message)
    return
  }

  for (const [index, attachment] of message.attachments.entries()) {
    const part = index + 1
    if (acceptedPart.get(row.id, part)) continue
    await send({
      ...message,
      subject: `${message.subject} (${part}/${message.attachments.length})`,
      messageId: message.messageId.replace('@', `-${part}@`),
      attachments: [attachment],
    })
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
  const {
    CAMPAIGN_MAIL_FROM: from, CAMPAIGN_SMTP_USER: user,
    CAMPAIGN_SMTP_HOST: host = 'postbox.cloud.yandex.net', CAMPAIGN_SMTP_PORT: port = '587',
    CAMPAIGN_SMTP_PASSWORD_FILE, CREDENTIALS_DIRECTORY,
  } = process.env
  const passwordPath = CAMPAIGN_SMTP_PASSWORD_FILE || (CREDENTIALS_DIRECTORY && join(CREDENTIALS_DIRECTORY, credentialName))
  let pass = ''
  try {
    if (passwordPath) pass = readFileSync(passwordPath, 'utf8').trim()
  } catch {
    console.warn('V4 campaign email is queued: SMTP credential file could not be read')
    return () => {}
  }
  if (!user || !pass || !host || (port !== '587' && port !== '465') || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) {
    console.warn('V4 campaign email is queued: configure SMTP credentials, port (587 or 465), and CAMPAIGN_MAIL_FROM')
    return () => {}
  }
  const transport = nodemailer.createTransport({
    host, port: Number(port), secure: port === '465', requireTLS: port === '587', auth: { user, pass },
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
  })
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await deliverCampaignMail(row => sendCampaignMail(row, from, message => transport.sendMail(message)))
    } catch { console.error('V4 campaign mail queue error') }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 5000)
  void tick()
  return () => clearInterval(timer)
}
