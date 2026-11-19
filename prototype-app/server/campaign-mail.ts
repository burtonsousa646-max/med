import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type SendMailOptions } from 'nodemailer'
import { platformName } from '../shared/brand.ts'
import { audienceGroups } from '../shared/campaign-draft.ts'
import { offerLayouts } from '../shared/campaign-offer.ts'
import { imageExtension, type IntakeData } from './campaign-intake.ts'
import { db } from './db.ts'
import { emailFont, emailHeading, emailLayout, emailLogo, escapeMailText } from './email-layout.ts'
import { partnerDetailsRows } from '../shared/partner-details.ts'

type MailRow = { id: string; data: string; submitted_at: number; mail_attempts: number }
const recipient = 'beepartners@beeline.ru'

const credentialName = 'ads-proto-smtp-password'
const acceptedPart = db.prepare('select 1 from v4_mail_parts where submission_id = ? and part = ?')
const markPartAccepted = db.prepare('insert into v4_mail_parts (submission_id, part) values (?, ?)')

function campaignMessage(row: MailRow, from: string) {
  const { mvp, mvpProfile, business, contactName, partnerDetails, registryDetails, addresses, online, offer, audience, audienceCity, email, triggers, offerImage, logoImage } = JSON.parse(row.data) as IntakeData
  const title = 'Новая заявка на рекламную кампанию'
  const subject = `${title} · ${platformName}`
  const submission = [`Заявка ${row.id}`, `Дата: ${new Date(row.submitted_at).toISOString()}`]
  const sections = [
    { title: 'Бизнес', lines: [
      `Название: ${business.name}`, `ИНН: ${business.inn}`, ...(contactName ? [`Представитель: ${contactName}`] : []), `Телефон: ${business.phone}`, `Сфера: ${business.category}`,
      ...(email ? [`Подтверждённый email: ${email}`] : []),
      `Сайт: ${business.website || '—'}`, `Город бизнеса: ${business.city || '—'}`,
      ...(mvpProfile?.addr ? ['Адрес при оформлении: ' + mvpProfile.addr] : []),
      `Работает онлайн: ${online ? 'да' : 'нет'}`, `Адреса: ${addresses.filter(Boolean).join('; ') || '—'}`,
    ] },
    { title: 'Реквизиты для партнёрского договора', lines: partnerDetailsRows(business.inn, registryDetails, partnerDetails)
      .map(([label, value]) => `${label}: ${value}`) },
    { title: 'Предложение', lines: [
      `Оффер: ${offer.title}`, `Промокод: ${offer.promo || '—'}`, `Скидка: ${offer.discount ? offer.discount + '%' : '—'}`,
      `Срок действия: ${offer.until || '—'}`, `Цвет: ${offer.background ?? offer.tone}`, `Акция 1 + 1: ${offer.gift ? 'да' : 'нет'}`,
      `Увеличенный креатив: ${offer.zoom ? 'да' : 'нет'}`, `Макет: ${offer.layout ? offerLayouts[offer.layout] : 'Автоматически'}`,
    ] },
    ...(mvp ? [{ title: 'Настройки промокампании', lines: [
      ...(mvp.check ? ['Средний чек: ' + mvp.check + ' ₽'] : []), ...(mvp.fee ? ['Комиссия: ' + mvp.fee + ' %'] : []), ...(mvp.via ? ['Передача заказов: ' + mvp.via] : []),
      'Настройка аудитории: ' + (mvp.mode === 'manual' ? 'вручную' : 'автоматически'), 'Оформление: ' + (offerImage?.name ?? mvp.design),
    ] }] : []),
    { title: 'Аудитория', lines: [
      ...audienceGroups.map(({ title, choices }, i) => `${title}: ${choices[audience[i]]}`),
      ...(audience[0] === 1 ? [`Город показа: ${audienceCity ?? business.city}`] : []),
      `Пожелания: ${triggers || '—'}`,
    ] },
  ]
  const acceptedTerms = 'Условия оферты приняты.'
  const plainDetails = [submission, ...sections.map(({ lines }) => lines)].map(lines => lines.join('\n')).join('\n\n')
  const text = `${plainDetails}\n${acceptedTerms}\n\n${platformName}`
  const details = sections.map(({ title, lines }) => `
    <h2 style="margin:20px 0 8px;padding-top:16px;border-top:1px solid #e2e6ed;font-family:${emailFont};font-size:18px;line-height:24px;font-weight:700;">${title}</h2>
    <p style="margin:0;word-wrap:break-word;overflow-wrap:anywhere;">${escapeMailText(lines.join('\n')).replaceAll('\n', '<br>')}</p>
  `).join('\n')
  return {
    from: { name: platformName, address: from },
    to: recipient,
    subject,
    // shortcut: SMTP can accept a message before a connection drops; reconcile ambiguous deliveries if duplicates must be ruled out.
    messageId: `<v4-campaign-${row.id}@${from.split('@')[1]}>`,
    text,
    html: emailLayout(subject, `
      ${emailHeading(title)}
      <p style="margin:0;color:#555d6d;font-size:14px;line-height:20px;word-wrap:break-word;overflow-wrap:anywhere;">${submission.map(escapeMailText).join('<br>')}</p>
      ${details}
      <p style="margin:20px 0 0;">${acceptedTerms}</p>
    `),
    attachments: [{ file: offerImage, label: 'offer' }, { file: logoImage, label: 'logo' }].flatMap(({ file, label }) => file ? [{
      filename: `${label}.${imageExtension(file.type)}`, contentType: file.type, content: Buffer.from(file.base64, 'base64'),
    }] : []),
  }
}

export async function sendCampaignMail(row: MailRow, from: string, send: (message: SendMailOptions) => Promise<unknown>) {
  const message = campaignMessage(row, from)
  // Finish partially sent submissions from the old transport without resending accepted parts.
  if (message.attachments.length !== 2 || ![1, 2].some(part => acceptedPart.get(row.id, part))) {
    await send({ ...message, attachments: [emailLogo, ...message.attachments] })
    return
  }

  for (const [index, attachment] of message.attachments.entries()) {
    const part = index + 1
    if (acceptedPart.get(row.id, part)) continue
    await send({
      ...message,
      subject: `${message.subject} (${part}/${message.attachments.length})`,
      messageId: message.messageId.replace('@', `-${part}@`),
      attachments: [emailLogo, attachment],
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

function campaignSmtp() {
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
    return undefined
  }
  if (!user || !pass || !host || (port !== '587' && port !== '465') || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) {
    console.warn('V4 campaign email is queued: configure SMTP credentials, port (587 or 465), and CAMPAIGN_MAIL_FROM')
    return undefined
  }
  const transport = nodemailer.createTransport({
    host, port: Number(port), secure: port === '465', requireTLS: port === '587', auth: { user, pass },
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 60_000,
  })
  return { from, send: (message: SendMailOptions) => transport.sendMail(message) }
}

export function campaignCodeMessage(email: string, code: string, from: string, purpose: 'confirmation' | 'staff' = 'confirmation') {
  const label = purpose === 'staff' ? 'Код входа для сотрудника' : 'Код подтверждения почты'
  const subject = `${label} · ${platformName}`
  const expiry = 'Он действует 10 минут.'
  const help = 'Если вы не запрашивали код, просто проигнорируйте письмо.'
  return {
    from: { name: platformName, address: from },
    to: [{ address: email, name: '' }],
    subject,
    text: `${label}: ${code}

${expiry} ${help}

${platformName}`,
    html: emailLayout(subject, `
      ${emailHeading(label)}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr><td bgcolor="#fff5c5" style="padding:12px 20px;border-radius:12px;color:#28303f;font-family:${emailFont};font-size:32px;line-height:40px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:4px;">
          ${escapeMailText(code)}
        </td></tr>
      </table>
      <p style="margin:16px 0 8px;">${expiry}</p>
      <p style="margin:0;color:#555d6d;">${help}</p>
    `),
    attachments: [emailLogo],
  }
}

export async function sendCampaignCode(email: string, code: string) {
  const smtp = campaignSmtp()
  if (!smtp) throw new Error('Campaign SMTP unavailable')
  await smtp.send(campaignCodeMessage(email, code, smtp.from))
}

export async function sendV4StaffCode(email: string, code: string) {
  const smtp = campaignSmtp()
  if (!smtp) throw new Error('Campaign SMTP unavailable')
  await smtp.send(campaignCodeMessage(email, code, smtp.from, 'staff'))
}

export function startCampaignMail() {
  const smtp = campaignSmtp()
  if (!smtp) return () => {}
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await deliverCampaignMail(row => sendCampaignMail(row, smtp.from, smtp.send))
    } catch { console.error('V4 campaign mail queue error') }
    finally { running = false }
  }
  const timer = setInterval(() => void tick(), 5000)
  void tick()
  return () => clearInterval(timer)
}
