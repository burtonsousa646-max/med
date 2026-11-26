import type {
  NotificationChannel,
  ChannelResult,
  SendNotificationRequest,
} from '@platform/contracts/notifications/v1/notifications'
import type { TransportRoute, Reservation } from './dispatch.types.ts'

/** Исход передачи, установленный адаптером; исключение после начала даёт unconfirmed. */
export type AttemptOutcome =
  | { submission: 'sent'; providerId?: string }
  | {
      submission: 'not_sent'
      reason:
        | 'invalid_contact'
        | 'provider_rejected'
        | 'recipient_unavailable'
        | 'expired'
        | 'temporary_rejection'
    }
  | { submission: 'unconfirmed' }

/** Адаптер учитывает сигнал отмены и срок непосредственно перед фактической передачей. */
export interface ChannelTransport extends TransportRoute {
  /** Если задано, адаптер сообщает, когда внешний вызов может отправить сообщение. */
  readonly reportsSubmissionStart?: true
  send(input: {
    attemptId: string
    contact: string
    text: string
    expiresAt: number
    deadline?: number
    signal: AbortSignal
    onSubmissionStarted?: () => void
  }): Promise<AttemptOutcome>
}

export interface SubmissionStore {
  register(initiator: string, request: SendNotificationRequest): Promise<string>
  skip(key: string, channel: string, reason: string): Promise<void>
  reserve(
    key: string,
    channel: string,
    route: () => TransportRoute,
    retries: readonly string[],
  ): Promise<Reservation>
  finish(key: string, channel: string, attemptId: string, outcome: AttemptOutcome): Promise<void>
  snapshot(key: string, channels: NotificationChannel[]): Promise<ChannelResult[]>
}

/** Дедлайн RPC и факт отмены доступны независимо от типа транспорта. */
export interface DispatchContext {
  deadline: number
  signal: AbortSignal
}
