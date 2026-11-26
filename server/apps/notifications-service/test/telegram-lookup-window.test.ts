import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { NotificationsDatabase } from '../src/infrastructure/prisma'
import { PrismaTelegramLookupWindow } from '../src/infrastructure/prisma/telegram-lookup-window.ts'

const url = process.env['TEST_NOTIFICATIONS_DATABASE_URL']
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Требуется отдельная TEST_NOTIFICATIONS_DATABASE_URL с суффиксом _test')
}

describe('Общее окно поиска номера Telegram', () => {
  const firstDb = new NotificationsDatabase(url)
  const secondDb = new NotificationsDatabase(url)
  const first = new PrismaTelegramLookupWindow(firstDb)
  const second = new PrismaTelegramLookupWindow(secondDb)

  afterAll(async () => {
    await Promise.all([firstDb.$disconnect(), secondDb.$disconnect()])
  })

  it('R3.1 даёт двум экземплярам одно окно для аккаунта и новое окно после истечения срока', async () => {
    const senderId = randomUUID()
    const otherSenderId = randomUUID()
    try {
      const results = await Promise.all([first.reserve(senderId), second.reserve(senderId)])
      expect(results.filter(({ reserved }) => reserved)).toHaveLength(1)
      const denied = results.find((result) => !result.reserved)
      expect(denied?.reserved).toBe(false)
      expect(denied?.retryInMs).toBeGreaterThan(0)
      expect(denied?.retryInMs).toBeLessThanOrEqual(3000)
      await expect(second.reserve(otherSenderId)).resolves.toEqual({ reserved: true })

      await firstDb.$executeRaw`
        UPDATE telegram_phone_lookup_windows
        SET next_lookup_at = clock_timestamp() - INTERVAL '1 millisecond'
        WHERE sender_id = ${senderId}
      `
      await expect(second.reserve(senderId)).resolves.toEqual({ reserved: true })
    } finally {
      await firstDb.telegramPhoneLookupWindow.deleteMany({
        where: { senderId: { in: [senderId, otherSenderId] } },
      })
    }
  })
})
