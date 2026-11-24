import { randomUUIDv7 } from 'node:crypto'
import {
  SubmissionStatus as Status,
  type NotificationChannel,
  type SendNotificationRequest,
} from '@platform/contracts/notifications/v1/notifications'
import {
  canonicalDispatch,
  channelKey,
  fingerprint,
  type FingerprintKeys,
  type Reservation,
  type TransportRoute,
  type AttemptOutcome,
} from '../../application'
import type { NotificationsDatabase } from './database.ts'

/** Хранит только отпечаток содержания и безопасные сведения о попытках. */
export class DispatchStore {
  constructor(
    private readonly db: NotificationsDatabase,
    private readonly keys: FingerprintKeys,
  ) {}

  /** Принимает идентичность инициатора из доверенного контекста сервиса. */
  async register(initiator: string, request: SendNotificationRequest): Promise<string> {
    if (!initiator.trim()) throw new Error('missing_initiator')
    const { channels, payload, expiresAt } = canonicalDispatch(request)
    const retryIds = [...new Set(request.retryAttemptIds.map((id) => id.toLowerCase()))]
    if (retryIds.some((id) => !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)))
      throw new Error('invalid_dispatch')
    const dispatchId = request.dispatchId.toLowerCase()
    return this.db.$transaction(
      async (tx) => {
        const inserted = await tx.dispatch.createMany({
          data: {
            id: randomUUIDv7(),
            initiator,
            dispatchId,
            expiresAt,
            keyVersion: this.keys.current,
            fingerprint: fingerprint(payload, this.keys, this.keys.current),
          },
          skipDuplicates: true,
        })
        const row = await tx.dispatch.findUniqueOrThrow({
          where: { initiator_dispatchId: { initiator, dispatchId } },
        })
        if (row.fingerprint !== fingerprint(payload, this.keys, row.keyVersion))
          throw new Error('dispatch_conflict')
        if (retryIds.length) {
          const count = await tx.submissionAttempt.count({
            where: {
              id: { in: retryIds },
              channel: { dispatchKey: row.id },
              submission: 'not_sent',
              reason: 'temporary_rejection',
            },
          })
          if (count !== retryIds.length) throw new Error('retry_conflict')
        }
        if (inserted.count) {
          await tx.dispatchChannel.createMany({
            data: channels.map((channel) => ({ id: randomUUIDv7(), dispatchKey: row.id, channel })),
          })
        }
        await tx.dispatchAudit.create({
          data: {
            id: randomUUIDv7(),
            dispatchKey: row.id,
            event: inserted.count ? 'registered' : 'replayed',
          },
        })
        return row.id
      },
      { isolationLevel: 'ReadCommitted' },
    )
  }

  /** Только результат reserved после фиксации транзакции разрешает первую передачу. */
  reserve(
    dispatchKey: string,
    channel: string,
    route: TransportRoute,
    retries: readonly string[] = [],
  ): Promise<Reservation> {
    return this.db.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string; expiresAt: Date | null }[]>`
        SELECT c.id, d.expires_at AS "expiresAt" FROM dispatch_channels c
        JOIN dispatches d ON d.id = c.dispatch_key
        WHERE c.dispatch_key = ${dispatchKey}::uuid AND c.channel = ${channel} FOR UPDATE OF c`
        if (!row) throw new Error('unknown_channel')
        const previous = await tx.submissionAttempt.findFirst({
          where: { channelId: row.id },
          orderBy: { number: 'desc' },
        })
        const audit = { id: randomUUIDv7(), dispatchKey, channel }
        const retry =
          previous &&
          previous.submission === 'not_sent' &&
          previous.reason === 'temporary_rejection' &&
          retries.some((id) => id.toLowerCase() === previous.id)
        await tx.dispatchAudit.create({
          data: { id: randomUUIDv7(), dispatchKey, channel, event: 'validated' },
        })
        if (previous && !retry) {
          await tx.dispatchAudit.create({
            data: { ...audit, event: 'already_started', attemptId: previous.id },
          })
          return { kind: 'existing', attemptId: previous.id }
        }
        if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
          await tx.dispatchChannel.update({ where: { id: row.id }, data: { reason: 'expired' } })
          await tx.dispatchAudit.create({ data: { ...audit, event: 'expired' } })
          return { kind: 'expired' }
        }
        const attemptId = randomUUIDv7()
        await tx.submissionAttempt.create({
          data: {
            id: attemptId,
            channelId: row.id,
            number: (previous?.number ?? 0) + 1,
            predecessorId: previous?.id,
            transport: route.transport,
            senderConfig: route.senderConfig,
          },
        })
        await tx.dispatchAudit.create({ data: { ...audit, event: 'started', attemptId } })
        return { kind: 'reserved', attemptId }
      },
      { isolationLevel: 'ReadCommitted' },
    )
  }

  /** Пропуск до начала передачи и аудит видны остальным обработчикам одновременно. */
  async skip(dispatchKey: string, channel: string, reason: string) {
    await this.db.$transaction([
      this.db.dispatchChannel.update({
        where: { dispatchKey_channel: { dispatchKey, channel } },
        data: { reason },
      }),
      this.db.dispatchAudit.create({
        data: { id: randomUUIDv7(), dispatchKey, channel, event: 'skipped:' + reason },
      }),
    ])
  }

  /** Поздний таймаут не перезаписывает уже подтверждённый исход. */
  async finish(dispatchKey: string, channel: string, attemptId: string, outcome: AttemptOutcome) {
    await this.db.$transaction(async (tx) => {
      const changed = await tx.submissionAttempt.updateMany({
        where: { id: attemptId, channel: { dispatchKey, channel }, submission: 'unconfirmed' },
        data: {
          submission: outcome.submission,
          reason: outcome.submission === 'not_sent' ? outcome.reason : null,
          ...(outcome.submission === 'sent' && { providerId: outcome.providerId }),
        },
      })
      if (changed.count)
        await tx.dispatchAudit.create({
          data: {
            id: randomUUIDv7(),
            dispatchKey,
            channel,
            attemptId,
            event:
              'outcome:' +
              outcome.submission +
              (outcome.submission === 'not_sent' ? ':' + outcome.reason : ''),
          },
        })
    })
  }

  /** Фиксирует выданный ответ из единого снимка включая основания и номер попытки. */
  snapshot(dispatchKey: string, channels: NotificationChannel[]) {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.dispatchChannel.findMany({
          where: { dispatchKey },
          include: { attempts: { take: 1, orderBy: { number: 'desc' } } },
        })
        const byName = new Map(rows.map((row) => [row.channel, row]))
        const results = channels.map((channel) => {
          const row = byName.get(channelKey(channel))
          if (!row) throw new Error('unknown_channel')
          const attempt = row.attempts[0]
          const reason = row.reason ?? attempt?.reason ?? undefined
          let status = Status.SUBMISSION_STATUS_NOT_SENT
          if (!row.reason && attempt?.submission === 'sent') status = Status.SUBMISSION_STATUS_SENT
          if (!row.reason && attempt?.submission === 'unconfirmed')
            status = Status.SUBMISSION_STATUS_UNCONFIRMED
          if (!attempt && !reason) throw new Error('incomplete_dispatch')
          return {
            channel,
            status,
            reason:
              status === Status.SUBMISSION_STATUS_UNCONFIRMED ? 'awaiting_confirmation' : reason,
            attemptId: attempt?.id,
            retryable: reason === 'temporary_rejection' && !!attempt,
          }
        })
        await tx.dispatchAudit.createMany({
          data: results.map((r) => ({
            id: randomUUIDv7(),
            dispatchKey,
            channel: channelKey(r.channel),
            attemptId: r.attemptId,
            event: 'response:' + r.status + (r.reason ? ':' + r.reason : ''),
          })),
        })
        return results
      },
      { isolationLevel: 'RepeatableRead' },
    )
  }
}
