import { createHash, randomBytes, randomUUIDv7 } from 'node:crypto'
import { ACCESS_LIFETIME_MS, requireLiveSession, SessionDenied } from '../domain'
import type { SessionIdentity, SessionStore } from './ports'

/** 32 случайных байта дают непрозрачный bearer-токен из 43 символов base64url. */
function tokenHash(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new SessionDenied()
  return createHash('sha256').update(token).digest('hex')
}

/** Выпускает независимые токены доступа, связанные с одной отзываемой сессией. */
export class Sessions {
  constructor(
    private readonly store: SessionStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private issueAccess(now: Date) {
    const accessToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + ACCESS_LIFETIME_MS)
    return { accessToken, expiresAt }
  }

  /** Сессия и первая пара токенов доступны только после фиксации транзакции. */
  async open(identity: SessionIdentity) {
    const now = this.clock()
    const refreshToken = randomBytes(32).toString('base64url')
    const access = this.issueAccess(now)
    await this.store.create(
      { ...identity, id: randomUUIDv7(), lastActivityAt: now, revokedAt: null },
      tokenHash(refreshToken),
      { hash: tokenHash(access.accessToken), expiresAt: access.expiresAt },
    )
    return { ...access, refreshToken }
  }

  /** Только подтверждённый пользовательский запрос обновляет время активности. */
  async validate(accessToken: string, userActivity: boolean): Promise<SessionIdentity> {
    return this.store.withAccess(tokenHash(accessToken), async (session, expiresAt) => {
      const now = this.clock()
      requireLiveSession(session.lastActivityAt, session.revokedAt, now)
      if (now >= expiresAt) throw new SessionDenied('access_expired')
      if (userActivity && now > session.lastActivityAt) await session.touch(now)
      return { userId: session.userId, verifiedEmail: session.verifiedEmail }
    })
  }

  /** Несколько вкладок могут получить свои действующие токены с общим refresh token. */
  async refresh(refreshToken: string) {
    return this.store.withRefresh(tokenHash(refreshToken), async (session) => {
      const now = this.clock()
      requireLiveSession(session.lastActivityAt, session.revokedAt, now)
      const access = this.issueAccess(now)
      await session.addAccess({ hash: tokenHash(access.accessToken), expiresAt: access.expiresAt })
      return access
    })
  }

  /** Повтор выхода по уже отозванной сессии сохраняет результат. */
  async revoke(refreshToken: string): Promise<void> {
    await this.store.withRefresh(tokenHash(refreshToken), async (session) => {
      if (!session.revokedAt) await session.revoke(this.clock())
    })
  }
}
