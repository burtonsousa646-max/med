import { randomBytes, randomUUID } from 'node:crypto'
import {
  NotificationChannel,
  SubmissionStatus,
} from '@platform/contracts/notifications/v1/notifications'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { RequestEmailCode } from '../src/application'
import { EncryptedCodes } from '../src/infrastructure'
import { PrismaChallengeStore, createDatabase } from '../src/infrastructure/prisma'
import { EmailDeliveryWorker } from '../src/infrastructure/prisma/email-delivery.ts'
import type { GrpcNotifications } from '../src/infrastructure/grpc/notifications.ts'

const databaseUrl = process.env['TEST_AUTH_DATABASE_URL']
if (!databaseUrl) throw new Error('Для интеграционных тестов требуется TEST_AUTH_DATABASE_URL')
const database = createDatabase({ databaseUrl, databaseTimeoutMs: 3000 })
afterAll(() => database.$disconnect())

/** Ограничивает выбор задания собственным адресом, сохраняя реальные операции PostgreSQL. */
function scopedDatabase(email: string) {
  return new Proxy(database, {
    get(target, key) {
      if (key !== 'emailDelivery') return Reflect.get(target, key, target) as unknown
      return new Proxy(target.emailDelivery, {
        get(model, operation) {
          if (operation !== 'findFirst') return Reflect.get(model, operation, model) as unknown
          return (args: Parameters<typeof model.findFirst>[0]) =>
            model.findFirst({
              ...args,
              where: { AND: [args?.where ?? {}, { challenge: { email } }] },
            })
        },
      })
    },
  })
}

describe('Доставка кода', () => {
  it('R1.1 R1.4 повторяет потерянный ответ с тем же UUID и создаёт новый при повторной отправке', async () => {
    const protection = new EncryptedCodes(randomBytes(32))
    const email = randomUUID() + '@example.test'
    let now = Date.now() - 60_000
    const request = new RequestEmailCode(
      new PrismaChallengeStore(database),
      protection,
      () => new Date(now),
    )
    await request.execute(email)
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Потерян ответ'))
      .mockImplementation((id: string) =>
        Promise.resolve({
          dispatchId: id,
          results: [
            {
              channel: NotificationChannel.NOTIFICATION_CHANNEL_EMAIL,
              status: SubmissionStatus.SUBMISSION_STATUS_SENT,
              retryable: false,
            },
          ],
        }),
      )
    const worker = new EmailDeliveryWorker(scopedDatabase(email), protection, {
      send: dispatch,
    } as unknown as GrpcNotifications)
    const first = await database.emailDelivery.findFirstOrThrow({ where: { challenge: { email } } })
    await worker.runOne()
    await database.emailDelivery.update({ where: { id: first.id }, data: { retryAt: new Date(0) } })
    await worker.runOne()
    expect(dispatch.mock.calls[0]?.[0]).toBe(first.id)
    expect(dispatch.mock.calls[1]?.[0]).toBe(first.id)
    now += 60_000
    await request.execute(email)
    const deliveries = await database.emailDelivery.findMany({ where: { challenge: { email } } })
    expect(deliveries).toHaveLength(2)
    expect(new Set(deliveries.map((item) => item.id)).size).toBe(2)
  })

  it('R1.5 не передаёт истёкший код', async () => {
    const protection = new EncryptedCodes(randomBytes(32))
    const email = randomUUID() + '@example.test'
    const request = new RequestEmailCode(
      new PrismaChallengeStore(database),
      protection,
      () => new Date(Date.now() - 600_000),
    )
    await request.execute(email)
    const send = vi.fn()
    const worker = new EmailDeliveryWorker(scopedDatabase(email), protection, {
      send,
    } as unknown as GrpcNotifications)
    await worker.runOne()
    expect(send).not.toHaveBeenCalled()
  })
})
