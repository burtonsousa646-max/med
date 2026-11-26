import { PrismaPg } from '@prisma/adapter-pg'
import type { PartnersConfig } from '@platform/config'
import { PrismaClient } from './generated/client.ts'

/** Создаёт Prisma с отдельным пулом для базы Partners. */
export function createDatabase(config: Pick<PartnersConfig, 'databaseUrl' | 'databaseTimeoutMs'>) {
  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.databaseTimeoutMs,
    statement_timeout: config.databaseTimeoutMs,
    query_timeout: config.databaseTimeoutMs,
  })
  return new PrismaClient({ adapter })
}

export type PartnersDatabase = ReturnType<typeof createDatabase>
export const PARTNERS_DATABASE = Symbol('PartnersDatabase')

/** Проверяет подключение без обращения к пользовательским данным. */
export async function probeDatabase(db: PartnersDatabase): Promise<void> {
  await db.$queryRaw`SELECT 1`
}
