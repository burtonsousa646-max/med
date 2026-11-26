import { randomUUIDv7 } from 'node:crypto'
import {
  CODE_LIFETIME_MS,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_MS,
  normalizeEmail,
  type CodeResult,
} from '../domain'
import type { ChallengeStore, CodeProtection } from './ports'

/** Сохраняет выпуск кода и задание доставки под одной блокировкой адреса. */
export class RequestEmailCode {
  constructor(
    private readonly store: ChallengeStore,
    private readonly protection: CodeProtection,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Возвращает успех после фиксации задания доставки. */
  async execute(input: string): Promise<CodeResult> {
    const email = normalizeEmail(input)
    if (!email) return 'invalid_input'
    return this.store.withAddress(email, async (tx) => {
      const previous = await tx.find()
      const now = this.now()
      if (previous && now.getTime() - previous.lastSentAt.getTime() < RESEND_INTERVAL_MS)
        return 'limited'
      if (previous && !previous.consumed && previous.expiresAt > now) {
        if (previous.attempts >= MAX_ATTEMPTS) return 'limited'
        await tx.save({ ...previous, lastSentAt: now })
        await tx.enqueue(previous.id)
        return 'ok'
      }

      const challenge = {
        id: randomUUIDv7(),
        email,
        sealedCode: this.protection.issue(email),
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
        attempts: 0,
        consumed: false,
      }
      await tx.replace(challenge)
      await tx.enqueue(challenge.id)
      return 'ok'
    })
  }
}
