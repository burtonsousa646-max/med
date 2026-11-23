import type { EmailIdentity, PartnerProfiles, RegistrationStore } from './ports'
import type { VerifyEmailCode } from './verify-email-code.use-case.ts'

/** Завершает регистрацию только после подтверждения кода и возвращает идентичность для выдачи сессии. */
export class RegisterProfile {
  constructor(
    private readonly verify: VerifyEmailCode,
    private readonly profiles: PartnerProfiles,
    private readonly registrations: RegistrationStore,
  ) {}

  async execute(email: string, code: string) {
    const identity = await this.verify.execute(email, code)
    if (typeof identity === 'string') return { outcome: identity } as const
    const userId = await this.complete(identity)
    return { outcome: 'ok', userId, verifiedEmail: identity.subject } as const
  }

  /** Восстанавливает только связь с профилем. Фоновая работа не создаёт сессию. */
  async recoverOne(): Promise<void> {
    const pending = await this.registrations.claimPending()
    if (pending) await this.complete(pending)
  }

  private async complete(identity: EmailIdentity): Promise<string> {
    if (identity.userId) return identity.userId
    const userId = await this.profiles.ensure(identity.registrationId, identity.subject)
    await this.registrations.bind(identity.registrationId, userId)
    return userId
  }
}
