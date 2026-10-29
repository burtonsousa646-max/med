// Входящие вебхуки: POST /api/hooks/<система>/<событие>.
// Заголовки: X-Event-Id — уникальный ID события у отправителя, X-Signature — sha256=<hex HMAC-SHA256 тела секретом системы>.
// Секрет — HOOK_SECRET_<СИСТЕМА>; вне production без переменной берётся dev-secret-<система>.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { TransactionSql } from 'postgres'
import { sql } from '../db.ts'
import { logCall } from './index.ts'

type HookHandler = (body: any, tx: TransactionSql, eventId: string) => Promise<void>
const hooks = new Map<string, HookHandler>()

/** Зарегистрировать обработчик: onHook('payments', 'payment.succeeded', async (body, tx) => { ... }).
 * Обработчик пишет в базу через tx — в той же транзакции, что и отметка о событии. */
export function onHook(system: string, event: string, fn: HookHandler) {
  hooks.set(`${system}/${event}`, fn)
}

export function hookSecret(system: string) {
  const v = process.env['HOOK_SECRET_' + system.replace(/[A-Z]/g, c => '_' + c).toUpperCase()]
  if (v) return v
  if (process.env.NODE_ENV === 'production') return null
  return `dev-secret-${system}`
}

export const sign = (secret: string, body: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

function validSignature(secret: string, body: string, header: string | undefined) {
  const want = Buffer.from(sign(secret, body)), got = Buffer.from(header ?? '')
  return want.length === got.length && timingSafeEqual(want, got)
}

export const hooksRouter = new Hono().post('/:system/:event', async c => {
  const { system, event } = c.req.param()
  const fn = hooks.get(`${system}/${event}`)
  if (!fn) return c.json({ message: 'неизвестное событие' }, 404)
  const secret = hookSecret(system)
  const raw = await c.req.text()
  if (!secret || !validSignature(secret, raw, c.req.header('x-signature'))) {
    logCall(system, 'in', event, false, null, null, { error: 'bad signature' })
    return c.json({ message: 'неверная подпись' }, 401)
  }
  const eventId = c.req.header('x-event-id')
  if (!eventId) return c.json({ message: 'нет X-Event-Id' }, 400)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ message: 'тело — не JSON' }, 400)
  }
  // Отметка о событии и его обработка — в одной транзакции: упадёт обработчик — событие можно прислать снова
  const fresh = await sql.begin(async tx => {
    const [row] = await tx`insert into inbound_events (system, event_id) values (${system}, ${eventId}) on conflict do nothing returning 1`
    if (!row) return false
    await fn(body, tx, eventId)
    return true
  })
  logCall(system, 'in', event, true, null, body, { duplicate: !fresh })
  return c.json({ ok: true, duplicate: !fresh })
})
