// Защита на входе: заголовки, лимит тела запроса, частота запросов с одного адреса.
import type { Context, MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import { getConnInfo } from '@hono/node-server/conninfo'

export const headers = secureHeaders({ crossOriginResourcePolicy: false }) // картинки креативов и embed.js берут с чужих сайтов

// Больше всего весят картинка креатива и CSV — до 2 МБ, плюс запас на разметку формы
export const limitBody = bodyLimit({ maxSize: 3 * 1024 * 1024, onError: c => c.json({ message: 'запрос больше 3 МБ' }, 413) })

/** Адрес клиента. За nginx — из X-Real-IP, но только если запрос пришёл с самого сервера: иначе заголовок подделывается. */
export function clientIp(c: Context) {
  let remote = ''
  try { remote = getConnInfo(c).remote.address ?? '' } catch { /* app.request в тестах: соединения нет */ }
  const local = !remote || remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  return (local && c.req.header('x-real-ip')) || remote || 'local'
}

// ponytail: окно и счётчики в памяти процесса; при нескольких экземплярах API — лимиты в nginx или Redis
const hits = new Map<string, { n: number; until: number }>()
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.until < now) hits.delete(k) }, 60_000).unref()

/** Не больше max запросов за минуту с одного адреса на группу маршрутов. Тесты (NODE_TEST_CONTEXT) не ограничиваются. */
export const rateLimit = (group: string, max: number): MiddlewareHandler => async (c, next) => {
  if (process.env.NODE_TEST_CONTEXT && !process.env.RATE_LIMIT_IN_TESTS) return next()
  const key = `${group}:${clientIp(c)}`, now = Date.now()
  const h = hits.get(key)
  if (!h || h.until < now) hits.set(key, { n: 1, until: now + 60_000 })
  else if (++h.n > max) {
    c.header('retry-after', String(Math.ceil((h.until - now) / 1000)))
    return c.json({ message: 'слишком много запросов, попробуйте через минуту' }, 429)
  }
  return next()
}
