/** Сроки отсчитываются по серверным часам, включая точное попадание на границу. */
export const ACCESS_LIFETIME_MS = 15 * 60_000
export const SESSION_IDLE_MS = 24 * 60 * 60_000

/** Истечение только access token допускает попытку тихого обновления. */
export class SessionDenied extends Error {
  constructor(readonly reason: 'invalid_session' | 'access_expired' = 'invalid_session') {
    super(reason)
  }
}

/** Состояние сессии проверяется раньше срока конкретного токена. */
export function requireLiveSession(lastActivityAt: Date, revokedAt: Date | null, now: Date): void {
  if (revokedAt || now.getTime() - lastActivityAt.getTime() >= SESSION_IDLE_MS) {
    throw new SessionDenied()
  }
}
