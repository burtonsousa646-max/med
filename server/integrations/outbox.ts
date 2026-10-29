// Исходящая очередь. Модуль кладёт задачу в той же транзакции, что и своё изменение; воркер выполняет её с ретраями.
// Задача берётся в аренду (next_at сдвигается на LEASE), поэтому упавший воркер не теряет её и не держит транзакцию.
import type { Sql, TransactionSql } from 'postgres'
import { sql } from '../db.ts'

type Db = Sql | TransactionSql
type Handler = (payload: any) => Promise<void>

const handlers = new Map<string, Handler>()
const MAX_ATTEMPTS = 8
const LEASE = '5 minutes'
// 10 с, 40 с, 2,5 мин, 10 мин, ... до часа
const backoff = (attempt: number) => Math.min(10 * 4 ** (attempt - 1), 3600)

/** Зарегистрировать исполнителя задачи: handle('ord', 'registerCreative', async p => { ... }). */
export function handle(system: string, action: string, fn: Handler) {
  handlers.set(`${system}.${action}`, fn)
}

/** Положить задачу. Повтор с тем же ключом не создаёт вторую. */
export async function enqueue(db: Db, system: string, action: string, payload: object, idempotencyKey: string) {
  await db`insert into outbox (system, action, payload, idempotency_key)
           values (${system}, ${action}, ${db.json(payload as never)}, ${idempotencyKey})
           on conflict (idempotency_key) do nothing`
}

type Task = { id: string; system: string; action: string; payload: unknown; attempts: number }

/** Выполнить созревшие задачи. Возвращает, сколько взято. */
export async function runOutbox(limit = 20) {
  const tasks = await sql<Task[]>`
    update outbox set attempts = attempts + 1, next_at = now() + ${LEASE}::interval
    where id in (select id from outbox where status = 'pending' and next_at <= now() order by next_at limit ${limit} for update skip locked)
    returning id, system, action, payload, attempts`
  for (const t of tasks) {
    const fn = handlers.get(`${t.system}.${t.action}`)
    try {
      if (!fn) throw new Error(`нет исполнителя ${t.system}.${t.action}`)
      await fn(t.payload)
      await sql`update outbox set status = 'done', last_error = null where id = ${t.id}`
    } catch (e) {
      const failed = t.attempts >= MAX_ATTEMPTS
      await sql`update outbox set status = ${failed ? 'failed' : 'pending'}, last_error = ${String((e as Error)?.message ?? e)},
                next_at = now() + ${backoff(t.attempts) + ' seconds'}::interval where id = ${t.id}`
    }
  }
  return tasks.length
}
