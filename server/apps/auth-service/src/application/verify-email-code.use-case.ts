import { randomUUIDv7 } from 'node:crypto'
import { MAX_ATTEMPTS, normalizeEmail, type CodeResult } from '../domain'
import type { ChallengeStore, CodeProtection, EmailIdentity } from './ports'

/** Погашает одноразовый код до этапа регистрации профиля. */
export class VerifyEmailCode {
  constructor(
    private readonly store: ChallengeStore,
    private readonly protection: CodeProtection,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Результат отказа возвращается после фиксации попытки, чтобы исключение не откатило счётчик. */
  async execute(input: string, code: string): Promise<Exclude<CodeResult, 'ok'> | EmailIdentity> {
    const email = normalizeEmail(input)
    if (!email || !/^\d{6}$/.test(code)) return 'invalid_input'
    return this.store.withAddress(email, async (tx) => {
      const current = await tx.find()
      if (!current || current.consumed || current.expiresAt <= this.now()) return 'invalid_code'
      if (current.attempts >= MAX_ATTEMPTS) return 'limited'
      const matched = this.protection.matches(email, current.sealedCode, code)
      await tx.save({ ...current, attempts: current.attempts + 1, consumed: matched })
      if (!matched) return 'invalid_code'
      return tx.reserveIdentity(randomUUIDv7())
    })
  }
}
