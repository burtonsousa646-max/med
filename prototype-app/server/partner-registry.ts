import { db } from './db.ts'
import type { RegistryDetails } from '../shared/partner-details.ts'

const retention = 7 * 24 * 60 * 60 * 1000
const upsert = db.prepare('insert into v4_partner_registry (inn, checked_at, data) values (?, ?, ?) on conflict (inn) do update set checked_at = excluded.checked_at, data = excluded.data')
const remove = db.prepare('delete from v4_partner_registry where inn = ?')
const purge = db.prepare('delete from v4_partner_registry where checked_at <= ?')
const lookup = db.prepare('select data from v4_partner_registry where inn = ? and checked_at > ?')

export function savePartnerRegistry(inn: string, details: RegistryDetails | null) {
  purge.run(Date.now() - retention)
  if (details) upsert.run(inn, details.checkedAt, JSON.stringify(details))
  else remove.run(inn)
}

export function readPartnerRegistry(inn: string, now: number): RegistryDetails | null {
  const row = lookup.get(inn, now - retention) as { data: string } | undefined
  return row ? JSON.parse(row.data) : null
}
