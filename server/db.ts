// Подключение к PostgreSQL. Адрес — DATABASE_URL, по умолчанию локальный Postgres.app.
import postgres, { type TransactionSql } from 'postgres'

export const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres@localhost/ads_platform', {
  max: Number(process.env.DB_POOL ?? 10),
  onnotice: () => {},
  types: { bigint: postgres.BigInt }, // деньги в копейках — bigint, без потери точности
})

export type Tx = TransactionSql<{ bigint: bigint }>
export type Db = typeof sql | Tx
