import { connect, isIP } from 'node:net'
import { checkServerIdentity, connect as connectTls } from 'node:tls'
import type { AttemptOutcome, ChannelTransport } from '../../application/submission.types.ts'
import { SmtpSession } from './smtp-session.ts'

interface SmtpConfig {
  host: string
  port: number
  implicitTls: boolean
  ca?: Buffer | undefined
  senderConfig: string
  from: string
  subject: string
  username: string
  password: string
}

const temporaryRejection = { submission: 'not_sent', reason: 'temporary_rejection' } as const
const providerRejected = { submission: 'not_sent', reason: 'provider_rejected' } as const
const expired = { submission: 'not_sent', reason: 'expired' } as const
const uncertain = { submission: 'unconfirmed' } as const

function message(from: string, to: string, subject: string, text: string): string {
  let subjectPart = ''
  const subjectWords: string[] = []
  for (const character of subject) {
    if (Buffer.byteLength(subjectPart + character) > 42) {
      subjectWords.push(`=?UTF-8?B?${Buffer.from(subjectPart).toString('base64')}?=`)
      subjectPart = ''
    }
    subjectPart += character
  }
  subjectWords.push(`=?UTF-8?B?${Buffer.from(subjectPart).toString('base64')}?=`)
  const body =
    Buffer.from(text)
      .toString('base64')
      .match(/.{1,76}/gu)
      ?.join('\r\n') ?? ''
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subjectWords.join('\r\n ')}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '.',
  ].join('\r\n')
}

/** Отправляет сервисное письмо по SMTP, сохраняя неопределённость при потере ответа. */
export class SmtpEmailTransport implements ChannelTransport {
  readonly transport = 'smtp'
  readonly senderConfig: string

  constructor(private readonly config: SmtpConfig) {
    this.senderConfig = config.senderConfig
  }

  async send({
    contact,
    text,
    expiresAt,
    signal,
  }: Parameters<ChannelTransport['send']>[0]): Promise<AttemptOutcome> {
    if (Date.now() >= expiresAt) return expired
    if (signal.aborted) return temporaryRejection
    const { host, port, implicitTls, ca, from, subject, username, password } = this.config
    if (/[\s<>,"\\\p{Cc}]/u.test(contact)) {
      return { submission: 'not_sent', reason: 'invalid_contact' }
    }
    const address = { host, port }
    const tls = {
      ca,
      servername: isIP(host) ? undefined : host,
      checkServerIdentity: (_name: string, cert: Parameters<typeof checkServerIdentity>[1]) =>
        checkServerIdentity(host, cert),
      rejectUnauthorized: true,
    }
    let socket = implicitTls ? connectTls({ ...address, ...tls }) : connect(address)
    const abort = () => socket.destroy()
    signal.addEventListener('abort', abort, { once: true })
    let transmitted = false

    try {
      let session = new SmtpSession(socket)
      if ((await session.reply()).code !== 220) return temporaryRejection
      let hello = await session.command('EHLO [127.0.0.1]')
      if (hello.code !== 250) return temporaryRejection

      if (!implicitTls) {
        if (!hello.lines.some((line) => /^STARTTLS$/iu.test(line))) return providerRejected
        if ((await session.command('STARTTLS')).code !== 220) return temporaryRejection
        await session.release()
        signal.throwIfAborted()
        socket = connectTls({ socket, ...tls })
        session = new SmtpSession(socket)
        hello = await session.command('EHLO [127.0.0.1]')
        if (hello.code !== 250) return temporaryRejection
      }

      const auth = Buffer.from(`\0${username}\0${password}`).toString('base64')
      const authReply = await session.command(`AUTH PLAIN ${auth}`)
      const authCode = authReply.code === 334 ? (await session.command(auth)).code : authReply.code
      if (authCode !== 235) return rejection(authCode, false)

      const envelope = from + contact
      const utf8 = Buffer.byteLength(envelope) !== envelope.length
      if (utf8 && !hello.lines.some((line) => /^SMTPUTF8$/iu.test(line))) {
        return { submission: 'not_sent', reason: 'invalid_contact' }
      }
      const mailCode = (await session.command(`MAIL FROM:<${from}>${utf8 ? ' SMTPUTF8' : ''}`)).code
      if (mailCode !== 250) return rejection(mailCode, false)
      const recipientCode = (await session.command(`RCPT TO:<${contact}>`)).code
      if (recipientCode < 200 || recipientCode >= 300) return rejection(recipientCode, false)
      const dataCode = (await session.command('DATA')).code
      if (dataCode !== 354) return rejection(dataCode, false)

      const payload = message(from, contact, subject, text)
      if (Date.now() >= expiresAt) return expired
      signal.throwIfAborted()
      transmitted = true
      const final = (await session.command(payload)).code
      return final >= 200 && final < 300 ? { submission: 'sent' } : rejection(final, true)
    } catch {
      return transmitted ? uncertain : temporaryRejection
    } finally {
      signal.removeEventListener('abort', abort)
      socket.destroy()
    }
  }
}

function rejection(code: number, transmitted: boolean): AttemptOutcome {
  if (code >= 400 && code < 500) return temporaryRejection
  if (code >= 500 && code < 600) return providerRejected
  return transmitted ? uncertain : temporaryRejection
}
