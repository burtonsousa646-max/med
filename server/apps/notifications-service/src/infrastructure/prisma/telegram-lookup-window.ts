import type { TelegramLookupWindow } from '../../application/ports/telegram.port.ts'
import type { NotificationsDatabase } from './database.ts'

/** Все экземпляры сервиса используют одно окно поиска на учётную запись. */
export class PrismaTelegramLookupWindow implements TelegramLookupWindow {
  constructor(private readonly db: NotificationsDatabase) {}

  async reserve(senderId: string) {
    const acquired = await this.db.$executeRaw`
      INSERT INTO telegram_phone_lookup_windows (sender_id, next_lookup_at)
      VALUES (${senderId}, clock_timestamp() + INTERVAL '3 seconds')
      ON CONFLICT (sender_id) DO UPDATE
      SET next_lookup_at = clock_timestamp() + INTERVAL '3 seconds'
      WHERE telegram_phone_lookup_windows.next_lookup_at <= clock_timestamp()
    `
    if (acquired > 0) return { reserved: true } as const

    const [window] = await this.db.$queryRaw<{ retryInMs: number }[]>`
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (next_lookup_at - clock_timestamp())) * 1000))::int
        AS "retryInMs"
      FROM telegram_phone_lookup_windows
      WHERE sender_id = ${senderId}
    `
    return { reserved: false, retryInMs: window?.retryInMs ?? 1 } as const
  }
}
