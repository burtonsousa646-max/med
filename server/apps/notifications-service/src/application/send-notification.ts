import {
  NotificationChannel as Channel,
  type SendNotificationRequest,
} from '@platform/contracts/notifications/v1/notifications'
import { channelKey } from './dispatch.ts'
import { EXTERNAL_EMAIL_PROVIDER } from './feature-flags.ts'
import type { FeatureFlagsPort } from './ports/feature-flags.port.ts'
import type {
  ChannelTransport,
  DispatchContext,
  SubmissionStore,
  AttemptOutcome,
} from './submission.types.ts'

const email = Channel.NOTIFICATION_CHANNEL_EMAIL
const telegram = Channel.NOTIFICATION_CHANNEL_TELEGRAM

/** Одна операция распределяет поручение между независимыми каналами. */
export class SendNotification {
  constructor(
    private readonly store: SubmissionStore,
    private readonly transports: ReadonlyMap<Channel, ChannelTransport>,
    private readonly timeoutMs: number,
    private readonly resultReserveMs: number,
    private readonly flags?: FeatureFlagsPort,
    private readonly externalEmail?: ChannelTransport,
  ) {}

  /** Регистрирует поручение один раз и возвращает согласованный снимок всех каналов. */
  async execute(initiator: string, request: SendNotificationRequest, context: DispatchContext) {
    if ((initiator === 'auth-service' || initiator === 'partners-service') && !request.expiresAt)
      throw new Error('invalid_dispatch')
    const key = await this.store.register(initiator, request)
    const channels = [...new Set(request.channels)]
    await Promise.all(channels.map((channel) => this.process(key, channel, request, context)))
    return { dispatchId: request.dispatchId, results: await this.store.snapshot(key, channels) }
  }

  /** Проверяет контакт, резервирует попытку и ограничивает время передачи адаптеру. */
  private async process(
    key: string,
    channel: Channel,
    request: SendNotificationRequest,
    context: DispatchContext,
  ) {
    const name = channelKey(channel)
    if (channel !== email && channel !== telegram)
      return this.store.skip(key, name, 'unsupported_channel')
    const contact = (channel === email ? request.email : request.phone)?.trim()
    if (!contact) return this.store.skip(key, name, 'missing_contact')
    const valid =
      channel === email
        ? contact.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact)
        : /^\+[1-9]\d{1,14}$/.test(contact)
    if (!valid) return this.store.skip(key, name, 'invalid_contact')
    const selection: { transport?: ChannelTransport | undefined } = {}
    const attempt = await this.store.reserve(
      key,
      name,
      () => {
        // Хранилище спрашивает маршрут только после проверки, что нужна новая попытка.
        if (channel === email && this.flags?.isEnabled(EXTERNAL_EMAIL_PROVIDER)) {
          selection.transport = this.externalEmail
          return selection.transport ?? { transport: 'external-unconfigured', senderConfig: 'none' }
        }
        selection.transport = this.transports.get(channel)
        return selection.transport ?? { transport: 'unconfigured', senderConfig: 'none' }
      },
      request.retryAttemptIds,
    )
    if (attempt.kind !== 'reserved') return
    const { transport } = selection
    const time = request.expiresAt
    const expiresAt = time ? Number(time.seconds) * 1000 + time.nanos / 1_000_000 : Infinity
    let outcome: AttemptOutcome
    const now = Date.now()
    const budget = Math.min(
      this.timeoutMs,
      context.deadline - now - this.resultReserveMs,
      Math.ceil(expiresAt - now),
    )
    if (now >= expiresAt) outcome = { submission: 'not_sent', reason: 'expired' }
    else if (!transport || context.signal.aborted || budget <= 0)
      outcome = { submission: 'not_sent', reason: 'temporary_rejection' }
    else {
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(budget)])
      // Ответ RPC может опередить подтверждение. Сохраняем и поздний результат той же попытки.
      const interrupted = Promise.withResolvers<undefined>()
      const abort = () => {
        interrupted.resolve(undefined)
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        const transmit = async () => {
          let observed: AttemptOutcome
          try {
            observed = await transport.send({
              attemptId: attempt.attemptId,
              contact,
              text: request.text,
              expiresAt,
              signal,
            })
          } catch {
            observed = { submission: 'unconfirmed' }
          }
          await this.store.finish(key, name, attempt.attemptId, observed)
        }
        const finished = await Promise.race([
          transmit().then(() => true),
          interrupted.promise.then(() => false),
        ])
        if (finished) return
        outcome = { submission: 'unconfirmed' }
      } finally {
        signal.removeEventListener('abort', abort)
      }
    }
    await this.store.finish(key, name, attempt.attemptId, outcome)
  }
}
