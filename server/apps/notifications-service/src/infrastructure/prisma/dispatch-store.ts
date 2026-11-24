import { randomUUIDv7 } from 'node:crypto'
import type { SendNotificationRequest } from '@platform/contracts/notifications/v1/notifications'
import {
  canonicalDispatch,
  fingerprint,
  type FingerprintKeys,
  type Reservation,
  type TransportRoute,
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
  reserve(dispatchKey: string, channel: string, route: TransportRoute): Promise<Reservation> {
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
        if (previous) {
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
          data: { id: attemptId, channelId: row.id, number: 1, ...route },
        })
        await tx.dispatchAudit.create({ data: { ...audit, event: 'started', attemptId } })
        return { kind: 'reserved', attemptId }
      },
      { isolationLevel: 'ReadCommitted' },
    )
  }
}
