export { normalizeEmail, MAX_ATTEMPTS, RESEND_INTERVAL_MS, CODE_LIFETIME_MS } from './email-code.ts'
export type { EmailChallenge, CodeResult } from './email-code.types.ts'
export {
  ACCESS_LIFETIME_MS,
  SESSION_IDLE_MS,
  SessionDenied,
  requireLiveSession,
} from './session.ts'
