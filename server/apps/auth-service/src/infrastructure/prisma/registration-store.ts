import type { EmailIdentity, RegistrationStore } from '../../application/ports'
import type { AuthDatabase } from './database.ts'

/** Короткие операции PostgreSQL завершаются до сетевого вызова Partners. */
export class PrismaRegistrationStore implements RegistrationStore {
  constructor(private readonly db: AuthDatabase) {}

  async bind(registrationId: string, userId: string) {
    const result = await this.db.authIdentity.updateMany({
      where: { registrationId, OR: [{ userId: null }, { userId }] },
      data: { userId },
    })
    if (result.count !== 1) throw new Error('Несовместимый результат регистрации')
  }

  /** Ограниченная аренда допускает повтор после падения процесса, SKIP LOCKED разделяет работу реплик. */
  async claimPending(): Promise<EmailIdentity | null> {
    const rows = await this.db.$queryRaw<EmailIdentity[]>`
      UPDATE auth_identities SET retry_at = CURRENT_TIMESTAMP + INTERVAL '30 seconds'
      WHERE registration_id = (
        SELECT registration_id FROM auth_identities
        WHERE provider = 'email' AND user_id IS NULL AND retry_at <= CURRENT_TIMESTAMP
        ORDER BY retry_at, registration_id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING subject, registration_id AS "registrationId", user_id AS "userId"
    `
    return rows[0] ?? null
  }
}
