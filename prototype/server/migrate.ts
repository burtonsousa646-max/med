// Миграции: файлы migrations/NNNN_*.sql по порядку, каждый в своей транзакции, один раз.
import { readdir, readFile } from 'node:fs/promises'
import { sql } from './db.ts'

const dir = new URL('../migrations/', import.meta.url)

export async function migrate() {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map(r => r.name))
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
  for (const f of files.filter(f => !done.has(f))) {
    const body = await readFile(new URL(f, dir), 'utf8')
    await sql.begin(async tx => {
      await tx.unsafe(body)
      await tx`insert into schema_migrations (name) values (${f})`
    })
    console.log('migrated', f)
  }
}

if (import.meta.main) {
  await migrate()
  await sql.end()
}
