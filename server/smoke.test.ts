// Каркас: миграции проходят с нуля и повторно, API отвечает, проводки не сходятся — база не даёт записать.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from './db.ts'
import { migrate } from './migrate.ts'
import { resetDb } from './testing.ts'
import { app } from './index.ts'

before(resetDb)
after(() => sql.end())

test('миграции повторно ничего не делают', async () => {
  const [{ n }] = await sql`select count(*)::int as n from schema_migrations`
  await migrate()
  const [{ m }] = await sql`select count(*)::int as m from schema_migrations`
  assert.equal(n, m)
  assert.ok(n >= 3)
})

test('health', async () => {
  const res = await app.request('/api/health')
  assert.equal(res.status, 200)
  assert.equal(((await res.json()) as { ok: boolean }).ok, true)
})

test('проводки, не сходящиеся в ноль, отклоняются', async () => {
  const [a] = await sql`insert into accounts (kind) values ('beeline_revenue') returning id`
  const [b] = await sql`insert into accounts (kind) values ('gateway') returning id`
  await assert.rejects(sql.begin(async tx => {
    const [t] = await tx`insert into transactions (kind, idempotency_key) values ('adjustment', 'bad') returning id`
    await tx`insert into entries (transaction_id, account_id, amount_kop) values (${t.id}, ${a.id}, 100), (${t.id}, ${b.id}, -99)`
  }), /не сходятся/)
  await sql.begin(async tx => {
    const [t] = await tx`insert into transactions (kind, idempotency_key) values ('adjustment', 'good') returning id`
    await tx`insert into entries (transaction_id, account_id, amount_kop) values (${t.id}, ${a.id}, 100), (${t.id}, ${b.id}, -100)`
  })
  const [{ s }] = await sql`select sum(balance_kop)::int as s from account_balances`
  assert.equal(s, 0)
})
