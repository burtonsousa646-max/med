import type {
  AccessRecord,
  LockedSession,
  SessionStore,
  StoredSession,
} from '../../application/ports'
import { SessionDenied } from '../../domain'
import type { AuthDatabase } from './database.ts'
import type { Prisma } from './generated/client.ts'

/** Все пути доступа блокируют одну и ту же сессию до проверки времени и записи изменений. */
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly db: AuthDatabase) {}

  async create(session: StoredSession, refreshHash: string, access: AccessRecord): Promise<void> {
    await this.db.authSession.create({
      data: { ...session, refreshHash, accessTokens: { create: access } },
    })
  }

  private locked(tx: Prisma.TransactionClient, row: StoredSession): LockedSession {
    return {
      ...row,
      addAccess: async (access) => {
        await tx.accessToken.create({ data: { ...access, sessionId: row.id } })
      },
      touch: async (lastActivityAt) => {
        await tx.authSession.update({ where: { id: row.id }, data: { lastActivityAt } })
      },
      revoke: async (revokedAt) => {
        await tx.authSession.update({ where: { id: row.id }, data: { revokedAt } })
      },
    }
  }

  withAccess<T>(
    hash: string,
    action: (session: LockedSession, expiresAt: Date) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<(StoredSession & { expiresAt: Date })[]>`
        SELECT s.id, s.user_id AS "userId", s.verified_email AS "verifiedEmail",
               s.last_activity_at AS "lastActivityAt", s.revoked_at AS "revokedAt", a.expires_at AS "expiresAt"
        FROM access_tokens a JOIN auth_sessions s ON s.id = a.session_id
        WHERE a.hash = ${hash} FOR UPDATE OF s`
      if (!row) throw new SessionDenied()
      return action(this.locked(tx, row), row.expiresAt)
    })
  }

  withRefresh<T>(hash: string, action: (session: LockedSession) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<StoredSession[]>`
        SELECT id, user_id AS "userId", verified_email AS "verifiedEmail",
               last_activity_at AS "lastActivityAt", revoked_at AS "revokedAt"
        FROM auth_sessions WHERE refresh_hash = ${hash} FOR UPDATE`
      if (!row) throw new SessionDenied()
      return action(this.locked(tx, row))
    })
  }
}
