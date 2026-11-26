import { createHash } from 'node:crypto'
import { setTimeout as wait } from 'node:timers/promises'
import type {
  TelegramClientFactory,
  TelegramLookupWindow,
} from '../../application/ports/telegram.port.ts'
import type { AttemptOutcome, ChannelTransport } from '../../application/submission.types.ts'

const temporaryRejection = { submission: 'not_sent', reason: 'temporary_rejection' } as const

/** Отправляет текст только после разрешения номера в личного адресата. */
export class TelegramTransport implements ChannelTransport {
  readonly transport = 'telegram'
  readonly reportsSubmissionStart = true

  constructor(
    readonly senderConfig: string,
    private readonly lookupWindow: TelegramLookupWindow,
    private readonly clients: TelegramClientFactory,
  ) {}

  async send(input: Parameters<ChannelTransport['send']>[0]): Promise<AttemptOutcome> {
    const {
      attemptId,
      contact,
      text,
      expiresAt,
      deadline = Infinity,
      signal,
      onSubmissionStarted,
    } = input
    let started = false
    let client: Awaited<ReturnType<TelegramClientFactory['connect']>> | undefined
    try {
      const initialRejection = beforeSubmission(expiresAt, deadline, signal)
      if (initialRejection) return initialRejection
      client = await this.clients.connect(signal)
      for (;;) {
        const rejection = beforeSubmission(expiresAt, deadline, signal)
        if (rejection) return rejection
        const window = await this.lookupWindow.reserve(this.senderConfig)
        if (window.reserved) break
        if (Date.now() + window.retryInMs >= Math.min(expiresAt, deadline)) {
          return temporaryRejection
        }
        await wait(window.retryInMs, undefined, { signal })
      }

      const beforeLookup = beforeSubmission(expiresAt, deadline, signal)
      if (beforeLookup) return beforeLookup
      const result = await client.resolvePhone(contact, signal)
      if (result.kind !== 'resolved') return { submission: 'not_sent', reason: result.kind }

      const beforeSend = beforeSubmission(expiresAt, deadline, signal)
      if (beforeSend) return beforeSend
      const randomId = createHash('sha256').update(attemptId).digest().readBigInt64BE() || 1n
      started = true
      onSubmissionStarted?.()
      return await client.sendText({ peer: result.peer, text, randomId, signal })
    } catch {
      if (started) return { submission: 'unconfirmed' }
      return beforeSubmission(expiresAt, deadline, signal) ?? temporaryRejection
    } finally {
      // Сбой закрытия соединения не меняет уже установленный исход отправки.
      await client?.close().catch(() => undefined)
    }
  }
}

function beforeSubmission(
  expiresAt: number,
  deadline: number,
  signal: AbortSignal,
): AttemptOutcome | undefined {
  const now = Date.now()
  if (now >= expiresAt) return { submission: 'not_sent', reason: 'expired' }
  if (now >= deadline || signal.aborted) return temporaryRejection
  return undefined
}
