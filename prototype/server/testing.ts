// Общее для тестов: чистая база перед файлом тестов (файлы идут по очереди, --test-concurrency=1),
// клиент с cookie и вход через страницы заглушек — как это делает браузер.
import { sql } from './db.ts'
import { migrate } from './migrate.ts'
import { app } from './index.ts'

export async function resetDb() {
  if (!/_test\b/.test(process.env.DATABASE_URL ?? '')) throw new Error('тесты только на базе *_test')
  await sql`drop schema public cascade`
  await sql`create schema public`
  await migrate()
}

export function client() {
  const jar = new Map<string, string>()
  async function req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers)
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    let body = init.body
    if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json) }
    const res = await app.request(path, { ...init, headers, body })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';'), i = pair.indexOf('=')
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)]
      if (/max-age=0/i.test(c) || !v) jar.delete(k)
      else jar.set(k, v)
    }
    return res as Omit<Response, 'json'> & { json(): Promise<any> } // в тестах ответы проверяем по полям
  }
  const form = (path: string, fields: Record<string, string>) =>
    req(path, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const hidden = (html: string, name: string) => html.match(new RegExp(`name="${name}" value="([^"]*)"`))![1].replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

  return {
    req, jar,
    /** Вход партнёра через бизнес-ID: старт → страница провайдера → колбэк. */
    async loginPartner(inn: string, name = 'Иванова Анна', provider = 'sber') {
      const { url } = await (await req('/api/auth/start', { method: 'POST', json: { provider } })).json()
      const html = await (await req(url)).text()
      const toCallback = await form('/api/stub/idp', { inn, name, email: '', state: hidden(html, 'state'), redirect_uri: hidden(html, 'redirect_uri') })
      return req(toCallback.headers.get('location')!)
    },
    async loginPhone(phone: string) {
      const { devCode } = await (await req('/api/auth/phone/start', { method: 'POST', json: { phone } })).json()
      return req('/api/auth/phone/verify', { method: 'POST', json: { phone, code: devCode } })
    },
    async loginStaff(roles: string, email = 'moderator@beeline.ru') {
      const { url } = await (await req('/api/auth/staff/start', { method: 'POST' })).json()
      const html = await (await req(url)).text()
      const toCallback = await form('/api/stub/sso', { email, name: 'Сотрудник', roles, state: hidden(html, 'state'), redirect_uri: hidden(html, 'redirect_uri') })
      return req(toCallback.headers.get('location')!)
    },
  }
}
