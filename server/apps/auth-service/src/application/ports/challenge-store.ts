import type { EmailChallenge } from '../../domain'

/** Задание доставки фиксируется в той же транзакции, что и выпуск кода. */
export interface DeliveryQueue {
  enqueue(challengeId: string): Promise<void>
}

/** Операции внутри блокировки одного адреса. */
export interface ChallengeTransaction extends DeliveryQueue {
  find(): Promise<EmailChallenge | null>
  replace(challenge: EmailChallenge): Promise<void>
  save(challenge: EmailChallenge): Promise<void>
}

/** Граница транзакции для проверки и заданий доставки. */
export interface ChallengeStore {
  withAddress<T>(email: string, operation: (tx: ChallengeTransaction) => Promise<T>): Promise<T>
}

/** Выпуск и проверка защищённого значения. */
export interface CodeProtection {
  issue(email: string): string
  matches(email: string, sealedCode: string, input: string): boolean
}
