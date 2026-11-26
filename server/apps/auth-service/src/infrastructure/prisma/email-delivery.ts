import { randomUUID } from 'node:crypto'
import {
  NotificationChannel,
  SubmissionStatus,
} from '@platform/contracts/notifications/v1/notifications'
import { EncryptedCodes } from '../code-protection.ts'
import { GrpcNotifications } from '../grpc/notifications.ts'
import type { AuthDatabase } from './database.ts'

/** Восстанавливает задания с устойчивым ключом и ограниченной арендой между экземплярами. */
export class EmailDeliveryWorker {
  constructor(
    private readonly db: AuthDatabase,
    private readonly codes: EncryptedCodes,
    private readonly notifications: GrpcNotifications,
  ) {}

  async runOne(): Promise<void> {
    const now = new Date()
    const candidate = await this.db.emailDelivery.findFirst({
      where: { sentAt: null, retryAt: { lte: now }, challenge: { expiresAt: { gt: now } } },
      orderBy: { retryAt: 'asc' },
    })
    if (!candidate) return
    const leaseId = randomUUID()
    const claim = await this.db.emailDelivery.updateMany({
      where: { id: candidate.id, sentAt: null, retryAt: { lte: now } },
      data: { leaseId, retryAt: new Date(now.getTime() + 30_000) },
    })
    if (!claim.count) return
    const delivery = await this.db.emailDelivery.findUnique({
      where: { id: candidate.id },
      include: { challenge: true },
    })
    if (!delivery || delivery.leaseId !== leaseId || delivery.challenge.expiresAt <= new Date())
      return
    try {
      const c = delivery.challenge
      const response = await this.notifications.send(
        delivery.id,
        c.email,
        this.codes.open(c.email, c.sealedCode).toString('ascii'),
        c.expiresAt,
        delivery.retryAttemptId,
      )
      const result = response.results.find(
        (entry) => entry.channel === NotificationChannel.NOTIFICATION_CHANNEL_EMAIL,
      )
      if (response.dispatchId !== delivery.id || !result)
        throw new Error('Некорректный ответ Notifications')
      const done =
        result.status === SubmissionStatus.SUBMISSION_STATUS_SENT ||
        (result.status === SubmissionStatus.SUBMISSION_STATUS_NOT_SENT && !result.retryable)
      const retryAttemptId =
        result.status === SubmissionStatus.SUBMISSION_STATUS_NOT_SENT &&
        result.retryable &&
        result.attemptId
          ? result.attemptId
          : null
      await this.db.emailDelivery.updateMany({
        where: { id: delivery.id, leaseId },
        data: {
          sentAt: done ? new Date() : null,
          retryAt: new Date(Date.now() + 1000),
          leaseId: null,
          retryAttemptId,
        },
      })
    } catch {
      // Аренда истечёт; повтор с теми же идентификаторами безопасен после потери ответа.
    }
  }
}
