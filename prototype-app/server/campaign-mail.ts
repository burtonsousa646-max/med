import nodemailer from 'nodemailer'
import { audienceGroups } from '../shared/campaign-draft.ts'
import { imageExtension, type IntakeData } from './campaign-intake.ts'
import { db } from './db.ts'

type MailRow = { id: string; data: string; submitted_at: number; mail_attempts: number }
const recipient = 'beepartners@beeline.ru'

export function campaignMessage(row: MailRow, from: string) {
  const { business, addresses, online, offer, audience, triggers, offerImage, logoImage } = JSON.parse(row.data) as IntakeData
  return {
    from, to: recipient, subject: 'Новая заявка на рекламную кампанию МЁД',
    messageId: `<campaign-${row.id}@${from.split('@').at(-1)}>`,
    text: [
      `Заявка ${row.id}`, `Дата: ${new Date(row.submitted_at).toISOString()}`, '',
      `Название: ${business.name}`, `ИНН: ${business.inn}`, `Телефон: ${business.phone}`, `Сфера: ${business.category}`,
      `Сайт: ${business.website || '—'}`, `Город: ${business.city || '—'}`,
      `Работает онлайн: ${online ? 'да' : 'нет'}`, `Адреса: ${addresses.filter(Boolean).join('; ') || '—'}`, '',
      `Оффер: ${offer.title}`, `Промокод: ${offer.promo || '—'}`, `Скидка: ${offer.discount ? offer.discount + '%' : '—'}`,
      `Срок действия: ${offer.until || '—'}`, `Цвет: ${offer.tone}`, `Акция 1 + 1: ${offer.gift ? 'да' : 'нет'}`,
      `Увеличенный креатив: ${offer.zoom ? 'да' : 'нет'}`, '',
      ...audienceGroups.map(({ title, choices }, i) => `${title}: ${choices[audience[i]]}`),
      `Пожелания: ${triggers || '—'}`, 'Условия оферты приняты.',
    ].join('\n'),
    attachments: [{ file: offerImage, label: 'offer' }, { file: logoImage, label: 'logo' }].flatMap(({ file, label }) => file ? [{
      filename: `${label}.${imageExtension(file.type)}`, content: Buffer.from(file.base64, 'base64'), contentType: file.type,
    }] : []),
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
  const { CAMPAIGN_SMTP_URL: url, CAMPAIGN_MAIL_FROM: from } = process.env
  if (!url || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || !/^smtps?:\/\//.test(url)) {
    console.warn('V4 campaign email is queued: configure CAMPAIGN_SMTP_URL and CAMPAIGN_MAIL_FROM')
    return () => {}
  }
  const smtp = nodemailer.createTransport({
    url, requireTLS: true, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    disableFileAccess: true, disableUrlAccess: true,
  })
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await deliverCampaignMail(async row => {
        const result = await smtp.sendMail(campaignMessage(row, from))
        if (!result.accepted?.length) throw new Error('Recipient rejected')
      })
    } catch { console.error('V4 campaign mail queue error') }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 5000)
  void tick()
  return () => clearInterval(timer)
}
