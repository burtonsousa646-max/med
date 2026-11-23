/** Подтверждённые данные возвращаются Gateway только для действующей сессии. */
export interface SessionIdentity {
  userId: string
  verifiedEmail: string
}

/** Открытый токен передаётся только вызывающему; хранилище получает его хеш. */
export interface AccessRecord {
  hash: string
  expiresAt: Date
}

export interface StoredSession extends SessionIdentity {
  id: string
  lastActivityAt: Date
  revokedAt: Date | null
}

/** Операции под блокировкой одной строки сериализуют refresh, активность и выход. */
export interface LockedSession extends StoredSession {
  addAccess(record: AccessRecord): Promise<void>
  touch(now: Date): Promise<void>
  revoke(now: Date): Promise<void>
}

export interface SessionStore {
  create(session: StoredSession, refreshHash: string, access: AccessRecord): Promise<void>
  withAccess<T>(
    hash: string,
    action: (session: LockedSession, expiresAt: Date) => Promise<T>,
  ): Promise<T>
  withRefresh<T>(hash: string, action: (session: LockedSession) => Promise<T>): Promise<T>
}
