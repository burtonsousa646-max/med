// Вход, сессии, роли. Партнёр входит через бизнес-ID (порт idp) или кодом на почту; сотрудник билайна — через SSO (порт staffSso).
// В cookie sid — случайный токен, в базе — его SHA-256. Компания и роль берутся из сессии, никогда из запроса.
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { sql, type Tx } from '../db.ts'
import { port } from '../integrations/index.ts'
import { stubCode } from '../integrations/stubs.ts'
import { enqueue } from '../integrations/outbox.ts'
import type { ExternalCompany, PartnerProvider } from '../integrations/ports.ts'

export type PartnerRole = 'owner' | 'staff' | 'accountant' | 'agency'
export type StaffRole = 'moderator' | 'manager' | 'finance' | 'admin'
export type PartnerAuth = { kind: 'partner'; userId: string; companyId: string; role: PartnerRole; signer: boolean }
export type StaffAuth = { kind: 'staff'; staffId: string; roles: StaffRole[] }
export type Env = { Variables: { partner: PartnerAuth; staff: StaffAuth } }

const PROVIDERS: { id: PartnerProvider; name: string }[] = [
  { id: 'gos', name: 'Госуслуги' },
  { id: 'sber', name: 'СберБизнес ID' },
  { id: 'alfa', name: 'Альфа ID для бизнеса' },
  { id: 'b2b', name: 'личный кабинет билайн бизнес' },
]
const PARTNER_TTL_H = 24 * 30
const STAFF_TTL_H = 12
const OTP_TTL_MIN = 10
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_S = 60

const PUBLIC_URL = () => process.env.PUBLIC_URL ?? 'http://127.0.0.1:8788'
const APP_URL = () => process.env.APP_URL ?? 'http://127.0.0.1:5174'
const secure = () => process.env.NODE_ENV === 'production'
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const token = () => randomBytes(32).toString('base64url')

export const fail = (status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429, message: string): never => { throw new HTTPException(status, { message }) }
export function errorHandler(e: Error, c: Context) {
  if (e instanceof HTTPException) return c.json({ message: e.message }, e.status)
  if (e instanceof SyntaxError) return c.json({ message: 'тело запроса — не JSON' }, 400)
  console.error(e)
  return c.json({ message: 'внутренняя ошибка' }, 500)
}

/* ───────── сессии ───────── */

async function startSession(c: Context, who: { userId?: string; staffId?: string; companyId?: string | null; provider: string }) {
  const t = token()
  const hours = who.staffId ? STAFF_TTL_H : PARTNER_TTL_H
  await sql`insert into sessions (token_hash, user_id, staff_id, company_id, provider, expires_at)
            values (${sha256(t)}, ${who.userId ?? null}, ${who.staffId ?? null}, ${who.companyId ?? null}, ${who.provider},
                    now() + ${hours + ' hours'}::interval)`
  setCookie(c, 'sid', t, { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/', maxAge: hours * 3600 })
}

type SessionRow = { token_hash: string; user_id: string | null; staff_id: string | null; company_id: string | null }
export async function session(c: Context) {
  const t = getCookie(c, 'sid')
  if (!t) return null
  const [s] = await sql<SessionRow[]>`select token_hash, user_id, staff_id, company_id from sessions where token_hash = ${sha256(t)} and expires_at > now()`
  return s ?? null
}

/** Партнёр с выбранной компанией. roles — кому из участников компании можно. */
export const partner = (...roles: PartnerRole[]): MiddlewareHandler<Env> => async (c, next) => {
  const s = await session(c)
  if (!s?.user_id) fail(401, 'нужно войти')
  if (!s!.company_id) fail(403, 'выберите или добавьте компанию')
  const [m] = await sql`select role, signer from memberships where company_id = ${s!.company_id} and user_id = ${s!.user_id}`
  if (!m) fail(403, 'нет доступа к компании')
  if (roles.length && !roles.includes(m.role)) fail(403, 'недостаточно прав')
  c.set('partner', { kind: 'partner', userId: s!.user_id!, companyId: s!.company_id!, role: m.role, signer: m.signer })
  await next()
}

/** Сотрудник билайна. roles — любая из; admin проходит везде. */
export const staff = (...roles: StaffRole[]): MiddlewareHandler<Env> => async (c, next) => {
  const s = await session(c)
  if (!s?.staff_id) fail(401, 'нужно войти как сотрудник')
  const [st] = await sql`select roles from staff where id = ${s!.staff_id} and active`
  if (!st) fail(403, 'учётная запись отключена')
  if (roles.length && !st.roles.includes('admin') && !roles.some(r => st.roles.includes(r))) fail(403, 'недостаточно прав')
  c.set('staff', { kind: 'staff', staffId: s!.staff_id!, roles: st.roles })
  await next()
}

/* ───────── пользователи и компании ───────── */

// Учётные записи по почте не склеиваем: почта от провайдера может быть не подтверждена, а склейка по ней — захват чужой записи.
// В users.email попадает только почта, подтверждённая кодом; контакты от провайдера лежат в identities.data.
async function userByIdentity(tx: Tx, provider: string, subject: string, p: { name: string; email?: string; phone?: string }) {
  const [known] = await tx`select user_id from identities where provider = ${provider} and subject = ${subject} and user_id is not null`
  if (known) return known.user_id as string
  const verifiedEmail = provider === 'email' ? subject : null
  const [user] = await tx`insert into users (name, email) values (${p.name}, ${verifiedEmail}) returning id`
  await tx`insert into identities (provider, subject, user_id, data)
           values (${provider}, ${subject}, ${user.id}, ${tx.json({ email: p.email ?? null, phone: p.phone ?? null })})`
  return user.id as string
}

// Адаптер idp возвращает company только если провайдер подтвердил полномочия человека в этой организации.
// Тогда он становится владельцем и подписантом. Остальных в компанию добавляет владелец приглашением.
async function linkCompany(tx: Tx, userId: string, co: ExternalCompany) {
  const [company] = await tx`insert into companies (inn, kpp, ogrn, name) values (${co.inn}, ${co.kpp ?? null}, ${co.ogrn ?? null}, ${co.name})
                             on conflict (inn) do update set inn = excluded.inn returning id`
  await tx`insert into memberships (company_id, user_id, role, title, signer) values (${company.id}, ${userId}, 'owner', ${co.role ?? ''}, true)
           on conflict (company_id, user_id) do update set role = 'owner', signer = true`
  await enqueue(tx, 'partners', 'verify', { companyId: company.id }, `kyc:${company.id}`)
  return company.id as string
}

const firstCompany = async (userId: string) =>
  ((await sql`select company_id from memberships where user_id = ${userId} order by created_at limit 1`)[0]?.company_id as string) ?? null

/* ───────── маршруты ───────── */

export const auth = new Hono<Env>()

auth.get('/providers', c => c.json(PROVIDERS))

// Куда вернуть после входа: только путь внутри интерфейса, не чужой адрес
const safeNext = (next: unknown) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/cabinet')

auth.post('/start', async c => {
  const { provider, next } = await c.req.json<{ provider: PartnerProvider; next?: string }>()
  if (!PROVIDERS.some(p => p.id === provider)) fail(422, 'неизвестный способ входа')
  const state = token()
  setCookie(c, 'oauth_state', `${provider}.${state}`, { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/api/auth', maxAge: 600 })
  setCookie(c, 'oauth_next', encodeURIComponent(safeNext(next)), { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/api/auth', maxAge: 600 })
  return c.json({ url: port('idp').authUrl({ provider, state, redirectUri: `${PUBLIC_URL()}/api/auth/callback/${provider}` }) })
})

auth.get('/callback/:provider', async c => {
  const provider = c.req.param('provider') as PartnerProvider
  const { code, state } = c.req.query()
  if (!code || getCookie(c, 'oauth_state') !== `${provider}.${state}`) fail(422, 'вход устарел, начните заново')
  deleteCookie(c, 'oauth_state', { path: '/api/auth' })
  const ext = await port('idp').exchange({ provider, code, redirectUri: `${PUBLIC_URL()}/api/auth/callback/${provider}` })
  const { userId, companyId } = await sql.begin(async tx => {
    const userId = await userByIdentity(tx, provider, ext.subject, ext)
    return { userId, companyId: ext.company ? await linkCompany(tx, userId, ext.company) : null }
  })
  await startSession(c, { userId, companyId: companyId ?? (await firstCompany(userId)), provider })
  const next = safeNext(decodeURIComponent(getCookie(c, 'oauth_next') ?? ''))
  deleteCookie(c, 'oauth_next', { path: '/api/auth' })
  return c.redirect(`${APP_URL()}${next}`)
})

auth.post('/email/start', async c => {
  const email = String((await c.req.json()).email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, 'проверьте почту')
  const [recent] = await sql`select 1 from otp_codes where target = ${email} and created_at > now() - ${OTP_RESEND_S + ' seconds'}::interval`
  if (recent) fail(429, 'код уже отправлен, подождите минуту')
  const code = String(randomInt(0, 1e6)).padStart(6, '0')
  const [row] = await sql`insert into otp_codes (target, purpose, code_hash, expires_at)
                          values (${email}, 'login', ${sha256(email + code)}, now() + ${OTP_TTL_MIN + ' minutes'}::interval) returning id`
  await port('messaging').send({ channel: 'email', to: email, template: 'login_code', params: { code }, idempotencyKey: `otp:${row.id}` })
  return c.json({ ok: true })
})

auth.post('/email/verify', async c => {
  const body = await c.req.json<{ email: string; code: string }>()
  const email = String(body.email ?? '').trim().toLowerCase()
  const [otp] = await sql`select id, code_hash, attempts from otp_codes
                          where target = ${email} and purpose = 'login' and used_at is null and expires_at > now()
                          order by created_at desc limit 1`
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) fail(422, 'код устарел, запросите новый')
  if (otp.code_hash !== sha256(email + String(body.code ?? ''))) {
    await sql`update otp_codes set attempts = attempts + 1 where id = ${otp.id}`
    fail(422, 'неверный код')
  }
  await sql`update otp_codes set used_at = now() where id = ${otp.id}`
  const userId = await sql.begin(tx => userByIdentity(tx, 'email', email, { name: '', email }))
  await startSession(c, { userId, companyId: await firstCompany(userId), provider: 'email' })
  return c.json({ ok: true })
})

auth.get('/me', async c => {
  const s = await session(c)
  if (!s) fail(401, 'нужно войти')
  if (s!.staff_id) {
    const [st] = await sql`select id, email, name, roles from staff where id = ${s!.staff_id}`
    return c.json({ kind: 'staff', staff: st })
  }
  const [user] = await sql`select id, name, email, phone from users where id = ${s!.user_id}`
  const companies = await sql`select c.id, c.name, c.inn, m.role, m.signer from memberships m join companies c on c.id = m.company_id
                              where m.user_id = ${s!.user_id} order by m.created_at`
  return c.json({ kind: 'partner', user, companyId: s!.company_id, companies })
})

auth.post('/company', async c => {
  const s = await session(c)
  if (!s?.user_id) fail(401, 'нужно войти')
  const { companyId } = await c.req.json<{ companyId: string }>()
  const [m] = await sql`select 1 from memberships where company_id = ${companyId} and user_id = ${s!.user_id}`
  if (!m) fail(403, 'нет доступа к компании')
  await sql`update sessions set company_id = ${companyId} where token_hash = ${s!.token_hash}`
  return c.json({ ok: true })
})

auth.post('/logout', async c => {
  const s = await session(c)
  if (s) await sql`delete from sessions where token_hash = ${s.token_hash}`
  deleteCookie(c, 'sid', { path: '/' })
  return c.json({ ok: true })
})

auth.post('/staff/start', c => {
  const state = token()
  setCookie(c, 'oauth_state', `staff.${state}`, { httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/api/auth', maxAge: 600 })
  return c.json({ url: port('staffSso').authUrl({ state, redirectUri: `${PUBLIC_URL()}/api/auth/staff/callback` }) })
})

auth.get('/staff/callback', async c => {
  const { code, state } = c.req.query()
  if (!code || getCookie(c, 'oauth_state') !== `staff.${state}`) fail(422, 'вход устарел, начните заново')
  deleteCookie(c, 'oauth_state', { path: '/api/auth' })
  const ext = await port('staffSso').exchange({ code, redirectUri: `${PUBLIC_URL()}/api/auth/staff/callback` })
  const roles = ext.roles.filter(r => ['moderator', 'manager', 'finance', 'admin'].includes(r))
  if (!roles.length) fail(403, 'у вас нет ролей в рекламной платформе')
  // роли каждый раз берём из SSO: сняли роль в каталоге — сняли и здесь
  const [st] = await sql`insert into staff (email, name, roles) values (${ext.email}, ${ext.name}, ${roles})
                         on conflict (email) do update set name = excluded.name, roles = excluded.roles returning id, active`
  if (!st.active) fail(403, 'учётная запись отключена')
  await sql`insert into identities (provider, subject, staff_id) values ('sso', ${ext.subject}, ${st.id}) on conflict do nothing`
  await startSession(c, { staffId: st.id, provider: 'sso' })
  return c.redirect(`${APP_URL()}/admin`)
})

/* ───────── страницы заглушек провайдеров (только stub и не production) ───────── */

export const stubPages = new Hono()
const stubAllowed = () => process.env.NODE_ENV !== 'production' || process.env.ALLOW_STUB_LOGIN === '1'
const page = (title: string, fields: string, hidden: Record<string, string>) => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px system-ui;max-width:420px;margin:48px auto;padding:0 16px}input,button{display:block;width:100%;margin:8px 0 16px;padding:10px;font:inherit;box-sizing:border-box}</style>
<h1>${title}</h1><p>Заглушка провайдера: настоящий вход появится при подключении системы.</p>
<form method="post">${fields}${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${escape(v)}">`).join('')}<button>войти</button></form>`
const escape = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
const back = (redirect: string, code: string, state: string) => {
  // заглушка возвращает только на свой же адрес колбэка
  if (!redirect.startsWith(`${PUBLIC_URL()}/api/auth/`)) fail(422, 'чужой адрес возврата')
  return `${redirect}?${new URLSearchParams({ code, state })}`
}

stubPages.get('/idp', c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const { provider, state, redirect_uri } = c.req.query()
  return c.html(page(`Вход: ${PROVIDERS.find(p => p.id === provider)?.name ?? provider}`,
    `<label>ИНН компании<input name="inn" required pattern="\\d{10}|\\d{12}" value="7701234567"></label>
     <label>ФИО<input name="name" required value="Иванова Анна Сергеевна"></label>
     <label>Почта<input name="email" type="email" value="anna@example.ru"></label>`, { state, redirect_uri }))
})
stubPages.post('/idp', async c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const f = await c.req.parseBody<Record<string, string>>()
  return c.redirect(back(f.redirect_uri, stubCode({ inn: f.inn, name: f.name, email: f.email || undefined }), f.state))
})
stubPages.get('/sso', c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const { state, redirect_uri } = c.req.query()
  return c.html(page('Вход сотрудника билайна',
    `<label>Почта<input name="email" type="email" required value="moderator@beeline.ru"></label>
     <label>Имя<input name="name" required value="Сергей Модеров"></label>
     <label>Роли через запятую<input name="roles" value="moderator"></label>`, { state, redirect_uri }))
})
stubPages.post('/sso', async c => {
  if (!stubAllowed()) fail(404, 'нет такой страницы')
  const f = await c.req.parseBody<Record<string, string>>()
  const roles = f.roles.split(',').map(r => r.trim()).filter(Boolean)
  return c.redirect(back(f.redirect_uri, stubCode({ email: f.email, name: f.name, roles }), f.state))
})
