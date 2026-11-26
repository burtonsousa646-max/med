import { randomUUIDv7 } from 'node:crypto'
import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { channelKey } from '../../application/dispatch.ts'
import type {
  PostboxEvent,
  PostboxEventStore,
} from '../../application/ports/postbox-events.port.ts'
import type { NotificationsDatabase } from './database.ts'

/** Записывает только проверенные поля события и защищает состояние попытки блокировкой строки. */
export class PrismaPostboxEventStore implements PostboxEventStore {
  constructor(private readonly db: NotificationsDatabase) {}

  async position(source: string, shard: string) {
    return (
      await this.db.postboxStreamPosition.findUnique({ where: { source_shard: { source, shard } } })
    )?.sequenceNumber
  }

  async advance(
    source: string,
    shard: string,
    previous: string | undefined,
    sequenceNumber: string,
  ) {
    if (previous === undefined) {
      const created = await this.db.postboxStreamPosition.createMany({
        data: { source, shard, sequenceNumber },
        skipDuplicates: true,
      })
      return created.count === 1
    }
    const updated = await this.db.postboxStreamPosition.updateMany({
      where: { source, shard, sequenceNumber: previous },
      data: { sequenceNumber },
    })
    return updated.count === 1
  }

  async apply(source: string, event: PostboxEvent) {
    await this.db.$transaction(async (tx) => {
      const inserted = await tx.postboxEvent.createMany({
        data: { source, ...event, result: 'unmatched' },
        skipDuplicates: true,
      })
      if (!inserted.count) return

      // Тот же ряд блокирует синхронная запись результата SendEmail.
      const [matched] = await tx.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM submission_attempts a JOIN dispatch_channels c ON c.id = a.channel_id
        WHERE a.id = ${event.attemptId}::uuid AND a.transport = 'postbox'
          AND c.channel = ${channelKey(NotificationChannel.NOTIFICATION_CHANNEL_EMAIL)}
        FOR UPDATE OF a
      `
      if (!matched) return
      const attempt = await tx.submissionAttempt.findUniqueOrThrow({
        where: { id: matched.id },
        include: { channel: true },
      })
      const where = { source_eventId: { source, eventId: event.eventId } }
      const delivery =
        event.kind === 'Send' ? undefined : event.kind === 'Bounce' ? 'bounced' : 'delivered'
      if (
        attempt.submission === 'not_sent' ||
        (attempt.providerId && attempt.providerId !== event.messageId) ||
        (attempt.delivery && delivery && attempt.delivery !== delivery)
      ) {
        await tx.postboxEvent.update({ where, data: { result: 'conflict' } })
        return
      }

      if (
        attempt.submission === 'unconfirmed' ||
        !attempt.providerId ||
        (delivery && !attempt.delivery)
      ) {
        await tx.submissionAttempt.update({
          where: { id: attempt.id },
          data: {
            submission: 'sent',
            providerId: event.messageId,
            reason: null,
            ...(delivery && { delivery }),
          },
        })
        await tx.dispatchAudit.create({
          data: {
            id: randomUUIDv7(),
            dispatchKey: attempt.channel.dispatchKey,
            channel: attempt.channel.channel,
            attemptId: attempt.id,
            event: `postbox:${event.kind.toLowerCase()}`,
          },
        })
      }
      await tx.postboxEvent.update({ where, data: { result: 'matched' } })
    })
  }
}
