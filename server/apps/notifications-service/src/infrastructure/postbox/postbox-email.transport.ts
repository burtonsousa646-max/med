import type { AttemptOutcome, ChannelTransport } from '../../application/submission.types.ts'

interface PostboxSenderConfig {
  readonly endpoint: string
  readonly id: string
  readonly from: string
  readonly subject: string
  readonly configurationSet: string
}

/** Передаёт письмо от сервисной учётной записи и возвращает только безопасный исход. */
export class PostboxEmailTransport implements ChannelTransport {
  readonly transport = 'postbox'
  readonly senderConfig: string
  private readonly sender: PostboxSenderConfig
  private readonly sendEmailUrl: URL

  constructor(
    sender: PostboxSenderConfig,
    private readonly getIamToken: () => string | undefined,
    private readonly request: typeof fetch = fetch,
  ) {
    if (
      !/^[a-zA-Z0-9_-]+$/.test(sender.id) ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(sender.from) ||
      !sender.subject.trim() ||
      /\r|\n/u.test(sender.subject) ||
      !/^[a-zA-Z0-9_-]+$/.test(sender.configurationSet)
    ) {
      throw new Error('Неверная конфигурация отправителя Postbox')
    }
    this.sender = { ...sender }
    this.senderConfig = sender.id
    this.sendEmailUrl = new URL('/v2/email/outbound-emails', sender.endpoint)
  }

  async send({
    attemptId,
    contact,
    text,
    expiresAt,
    signal,
  }: Parameters<ChannelTransport['send']>[0]): Promise<AttemptOutcome> {
    if (Date.now() >= expiresAt) return { submission: 'not_sent', reason: 'expired' }
    try {
      const token = this.getIamToken()
      if (!token || !/^[\x21-\x7E]+$/u.test(token) || signal.aborted) {
        return { submission: 'not_sent', reason: 'temporary_rejection' }
      }
      const payload = new TextEncoder().encode(
        JSON.stringify({
          ConfigurationSetName: this.sender.configurationSet,
          FromEmailAddress: this.sender.from,
          Destination: { ToAddresses: [contact] },
          Content: {
            Simple: {
              Subject: { Data: this.sender.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: text, Charset: 'UTF-8' } },
            },
          },
          EmailTags: [{ Name: 'attempt_id', Value: attemptId }],
        }),
      )
      // Потоковое тело Fetch не может повторно передать при обработке сбоя соединения.
      const options = {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.byteLength),
          'X-YaCloud-SubjectToken': token,
        },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(payload)
            controller.close()
          },
        }),
        duplex: 'half',
        signal,
      } as const
      if (Date.now() >= expiresAt) return { submission: 'not_sent', reason: 'expired' }
      return await this.submit(options)
    } catch {
      return { submission: 'not_sent', reason: 'temporary_rejection' }
    }
  }

  /** После начала HTTP-запроса неопределённый исход исключает повтор отправки. */
  private async submit(options: RequestInit): Promise<AttemptOutcome> {
    try {
      const response = await this.request(this.sendEmailUrl, options)
      if (response.status === 200) {
        const result: unknown = await response.json()
        if (
          result &&
          typeof result === 'object' &&
          'MessageId' in result &&
          typeof result.MessageId === 'string' &&
          /^[a-zA-Z0-9_-]+$/.test(result.MessageId)
        ) {
          return { submission: 'sent', providerId: result.MessageId }
        }
        return { submission: 'unconfirmed' }
      }
      void response.body?.cancel().catch(() => undefined)
      if (response.status === 429) return { submission: 'not_sent', reason: 'temporary_rejection' }
      if ([400, 401, 403, 404].includes(response.status)) {
        return { submission: 'not_sent', reason: 'provider_rejected' }
      }
    } catch {
      // Исключение Fetch или обрыв тела ответа не доказывают отказ Postbox.
    }
    return { submission: 'unconfirmed' }
  }
}
