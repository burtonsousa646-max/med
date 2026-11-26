import { PrismaPg } from '@prisma/adapter-pg'
import type { AuthConfig } from '@platform/config'
import { PrismaClient } from './generated/client.ts'

/** Создаёт Prisma с отдельным пулом для базы Auth. */
export function createDatabase(config: Pick<AuthConfig, 'databaseUrl' | 'databaseTimeoutMs'>) {
  const adapter = new PrismaPg({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.databaseTimeoutMs,
    statement_timeout: config.databaseTimeoutMs,
    query_timeout: config.databaseTimeoutMs,
  })
  return new PrismaClient({ adapter })
}

export type AuthDatabase = ReturnType<typeof createDatabase>
export const AUTH_DATABASE = Symbol('AuthDatabase')

/** Проверяет подключение без обращения к пользовательским данным. */
export async function probeDatabase(db: AuthDatabase): Promise<void> {
  await db.$queryRaw`SELECT 1`
}
