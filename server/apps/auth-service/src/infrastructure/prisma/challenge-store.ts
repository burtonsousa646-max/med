import { randomUUIDv7 } from 'node:crypto'
import type { ChallengeStore, ChallengeTransaction } from '../../application/ports'
import type { AuthDatabase } from './database.ts'

/** Сериализует запросы, в том числе два первых выпуска при ещё отсутствующей записи. */
export class PrismaChallengeStore implements ChallengeStore {
  constructor(private readonly db: AuthDatabase) {}

  withAddress<T>(email: string, operation: (tx: ChallengeTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (database) => {
      await database.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${email}::text, 0))`
      return operation({
        reserveIdentity: (registrationId) =>
          database.authIdentity.upsert({
            where: { provider_subject: { provider: 'email', subject: email } },
            create: { provider: 'email', subject: email, registrationId },
            update: {},
            select: { subject: true, registrationId: true, userId: true },
          }),
        find: () => database.emailChallenge.findUnique({ where: { email } }),
        replace: async (challenge) => {
          await database.emailChallenge.deleteMany({ where: { email } })
          await database.emailChallenge.create({ data: challenge })
        },
        save: async ({ id, attempts, consumed, lastSentAt }) => {
          await database.emailChallenge.update({
            where: { id },
            data: { attempts, consumed, lastSentAt },
          })
        },
        enqueue: async (challengeId) => {
          await database.emailDelivery.create({ data: { id: randomUUIDv7(), challengeId } })
        },
      })
    })
  }
}
