import { dashboardSearchParams } from '../shared/cabinet-dashboard.ts'
import { campaignBoard, cabinetOverview, cabinetList } from './cabinet-dashboard.ts'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { normalizeCampaignEmail } from '../shared/campaign-draft.ts'
import { v4StaffPageSize, type V4StaffMember, type V4StaffSession, type V4Submission, type V4SubmissionSummary } from '../shared/v4-staff.ts'
import { imageExtension, type IntakeData } from './campaign-intake.ts'
import { contractRecord, contractForSubmission, contractDownload, emailContract, type ContractSender } from './campaign-contracts.ts'
import { sendContractDocument } from './campaign-mail.ts'
import { campaignCardCopy, moveCampaign, readPartnerCampaign, readReview, updateReview } from './market.ts'
import { accountCookie, accountSession } from './mvp.ts'
import { configuredRoles, roleForEmail } from './staff-role.ts'
import { staffCatalog, staffCatalogRecord, editMarket } from './market-catalog.ts'
import { db } from './db.ts'
import { readPartnerRegistry } from './partner-registry.ts'
import type { RegistryDetails } from '../shared/partner-details.ts'

const minute = 60_000
const sessionSeconds = 8 * 60 * 60
const maxAttempts = 5
const cookie = 'v4_staff'
const path = '/api/v4/staff'
const pepper = randomBytes(32)
const codeHash = (email: string, code: string) => createHmac('sha256', pepper).update(email + ':' + code).digest()
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const normalizeStaffEmail = (value: unknown) => typeof value === 'string' ? normalizeCampaignEmail(value).toLowerCase() : ''

const reserveCode = db.prepare(`
  insert into v4_staff_codes (email, code_hash, sent_at, window_start, sent_count)
  values (?, ?, ?, ?, 1)
  on conflict(email) do update set code_hash = excluded.code_hash, sent_at = excluded.sent_at, attempts = 0,
    window_start = case when window_start <= ? then excluded.window_start else window_start end,
    sent_count = case when window_start <= ? then 1 else sent_count + 1 end
  where sent_at <= ? and (window_start <= ? or sent_count < 5)
`)
const readCode = db.prepare('select code_hash, sent_at, attempts from v4_staff_codes where email = ?')
const failCode = db.prepare('update v4_staff_codes set attempts = ? where email = ? and code_hash = ?')
const insertSession = db.prepare('insert into v4_staff_sessions (token_hash, email, expires_at) values (?, ?, ?)')
const deleteSession = db.prepare('delete from v4_staff_sessions where token_hash = ?')
const deleteExpired = db.prepare('delete from v4_staff_sessions where expires_at <= ?')
const readSession = db.prepare('select email from v4_staff_sessions where token_hash = ? and expires_at > ?')
const listMembers = db.prepare('select email, added_at as addedAt, added_by as addedBy from v4_staff_members order by email')
const addMember = db.prepare('insert or ignore into v4_staff_members (email, added_at, added_by) values (?, ?, ?)')

db.function('v4_staff_fold', { deterministic: true }, value => String(value ?? '').toLowerCase())
const search = `where ? = '' or instr(v4_staff_fold(json_extract(data, '$.business.name')), ?) > 0
  or instr(json_extract(data, '$.business.inn'), ?) > 0 or instr(v4_staff_fold(json_extract(data, '$.email')), ?) > 0`
const list = db.prepare(`
  select id, submitted_at as submittedAt, json_extract(data, '$.business.name') as name,
    json_extract(data, '$.business.inn') as inn, json_extract(data, '$.business.city') as city,
    json_extract(data, '$.contactName') as contactName, json_extract(data, '$.business.phone') as phone,
    json_extract(data, '$.email') as email, json_extract(data, '$.offer.title') as title, json_extract(data, '$.offer.until') as until
  from v4_submissions ${search} order by submitted_at desc, id desc limit ? offset ?
`)
const count = db.prepare('select count(*) as total from v4_submissions ' + search)
const details = db.prepare('select submitted_at as submittedAt, data from v4_submissions where id = ?')
const submissionRegistry = db.prepare(`select json_extract(data, '$.business.inn') as inn,
  json_extract(data, '$.registryDetails') as snapshot from v4_submissions where id = ?`)
const attachRegistry = db.prepare(`update v4_submissions set data = json_set(data, '$.registryDetails', json(?))
  where id = ? and json_extract(data, '$.registryDetails') is null`)

function lookupCompany(inn: string) {
  const url = new URL('/api/autocomplete/inn', process.env.AUTOCOMPLETE_URL || 'http://127.0.0.1:8788')
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inn }),
    signal: AbortSignal.timeout(10_000), redirect: 'error' })
}

export function createV4Staff(
  { addresses, administrators = [], lookupRegistry = lookupCompany, sendDocument=sendContractDocument }: {
    addresses: readonly string[]; sendDocument?:ContractSender; administrators?: readonly string[]; lookupRegistry?: (inn: string) => Promise<Response>
  },
  sendCode: (email: string, code: string) => Promise<void>,
  now = Date.now,
) {
  const configured = configuredRoles(addresses, administrators)
  const staffEmails = [...configured.keys()]
  const roleFor = (email: string) => roleForEmail(email, configured)
  const routes = new Hono()
  const smallBody = bodyLimit({ maxSize: 1024, onError: c => c.json({ message: 'Слишком большой запрос' }, 413) })
  const jsonBody = (request: Request) => request.headers.get('Content-Type')?.split(';')[0].trim() === 'application/json'
    ? request.json().catch(() => null) : Promise.resolve(null)

  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    c.header('X-Content-Type-Options', 'nosniff')
    await next()
  })

  routes.post('/code', smallBody, async c => {
    const body = await jsonBody(c.req.raw)
    const email = normalizeStaffEmail(body?.email)
    if (!email) return c.json({ message: 'Укажите корректный email' }, 400)
    if (!roleFor(email)) return c.json({ status: 'sent' })
    const time = now()
    const hour = time - 60 * minute
    const code = String(randomInt(1_000_000)).padStart(6, '0')
    const hash = codeHash(email, code).toString('hex')
    const reserved = reserveCode.run(email, hash, time, time, hour, hour, time - minute, hour)
    if (!reserved.changes) return c.json({ status: 'sent' })
    try { await sendCode(email, code) }
    catch {
      failCode.run(maxAttempts, email, hash)
      return c.json({ message: 'Не удалось отправить письмо. Попробуйте через минуту' }, 503)
    }
    return c.json({ status: 'sent' })
  })

  routes.post('/verify', smallBody, async c => {
    const body = await jsonBody(c.req.raw)
    const email = normalizeStaffEmail(body?.email)
    const code = body?.code
    const rejected = { message: 'Код не подошёл или истёк. Проверьте почту или запросите новый код' }
    const role = roleFor(email)
    if (!role || typeof code !== 'string' || !/^\d{6}$/.test(code)) return c.json(rejected, 401)
    const time = now()
    db.exec('begin immediate')
    try {
      const current = readCode.get(email) as { code_hash: string; sent_at: number; attempts: number } | undefined
      if (!current || current.attempts >= maxAttempts || time >= current.sent_at + 10 * minute) {
        db.exec('commit')
        return c.json(rejected, 401)
      }
      const valid = timingSafeEqual(Buffer.from(current.code_hash, 'hex'), codeHash(email, code))
      failCode.run(valid ? maxAttempts : current.attempts + 1, email, current.code_hash)
      if (!valid) { db.exec('commit'); return c.json(rejected, 401) }

      const old = getCookie(c, cookie)
      if (old) deleteSession.run(tokenHash(old))
      deleteExpired.run(time)
      const token = randomBytes(32).toString('base64url')
      insertSession.run(tokenHash(token), email, time + sessionSeconds * 1000)
      db.exec('commit')
      setCookie(c, cookie, token, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
        sameSite: 'Strict', path, maxAge: sessionSeconds,
      })
      return c.json({ email, role } satisfies V4StaffSession)
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  })

  const protectedRoutes = new Hono<{ Variables: { staff: V4StaffSession; token: string } }>()
  protectedRoutes.use('*', async (c, next) => {
    const unified = getCookie(c, accountCookie)
    const token = unified ?? getCookie(c, cookie)
    const session = unified ? accountSession(unified, now()) : token && /^[\w-]{43}$/.test(token) ? readSession.get(tokenHash(token), now()) as { email: string } | undefined : undefined
    const role = session && roleFor(session.email)
    if (!token || !session || !role) return c.json({ message: 'Войдите по рабочей почте' }, 401)
    c.set('staff', { email: session.email, role })
    c.set('token', token)
    await next()
  })
  protectedRoutes.get('/contracts/:id',c=>{
    const record=contractRecord(c.req.param('id'))
    return record?c.json(record):c.json({message:'Договор не найден.'},404)
  })
  protectedRoutes.post('/contracts/:id/email',c=>emailContract(c,c.req.param('id'),sendDocument))
  protectedRoutes.get('/contracts/:id/pdf',c=>contractDownload(c.req.param('id'),undefined,c.req.query('view')==='inline'))
  protectedRoutes.post('/contracts/:id/confirm',smallBody,async c=>{
    const id=c.req.param('id'),body=await jsonBody(c.req.raw),employee=c.var.staff.email
    db.exec('begin immediate')
    try {
      const record=contractRecord(id)
      if(!record || record.version!==body?.version) {db.exec('rollback');return c.json({message:'Обновите версию договора перед подтверждением.'},409)}
      if(!record.signedAt) {
        db.prepare('update campaign_contracts set signed_at=?,signed_by=? where id=?').run(now(),employee,id)
        if(record.submissionId && readPartnerCampaign(record.submissionId,'').status==='contract') {
          const moved=moveCampaign(record.submissionId,employee,{status:'review',version:readReview(record.submissionId).version})
          if(moved.error){db.exec('rollback');return c.json({message:moved.error},moved.status)}
        }
      }
      db.exec('commit')
      return c.json(contractRecord(id))
    } catch(e){db.exec('rollback');throw e}
  })
  protectedRoutes.get('/board', c => c.json(campaignBoard(staffEmails)))
  protectedRoutes.post('/submissions/:id/stage', smallBody, async c => {
    const result = moveCampaign(c.req.param('id'),c.var.staff.email,await jsonBody(c.req.raw))
    return result.error ? c.json({message:result.error},result.status) : c.json(result)
  })
  protectedRoutes.get('/dashboard', c => c.json(cabinetOverview(undefined,staffEmails)))
  protectedRoutes.post('/dashboard/rows', smallBody, async c => c.json(cabinetList(dashboardSearchParams(await jsonBody(c.req.raw)),undefined,staffEmails)))
  protectedRoutes.get('/offers', c=>{
    const query=(c.req.query('q') ?? '').trim(), offset=Number(c.req.query('offset') ?? 0)
    if (query.length>200 || !Number.isSafeInteger(offset) || offset<0) return c.json({message:'Проверьте параметры поиска'},400)
    return c.json(staffCatalog(query,offset,c.req.query('status') ?? ''))
  })
  protectedRoutes.get('/offers/:key', c=>{
    const item=staffCatalogRecord(c.req.param('key'))
    return item ? c.json(item) : c.json({message:'Предложение не найдено'},404)
  })
  protectedRoutes.post('/offers/:key',bodyLimit({maxSize:64*1024}),async c=>{
    const result=editMarket(c.req.param('key'),c.var.staff.email,await jsonBody(c.req.raw))
    return result.saved ? c.json(result.saved) : c.json({message:result.error},result.status)
  })
  protectedRoutes.get('/session', c => c.json(c.var.staff))
  protectedRoutes.use('/team', async (c, next) => {
    if (c.var.staff.role !== 'admin') return c.json({ message: 'Управлять доступом могут администраторы' }, 403)
    await next()
  })
  protectedRoutes.get('/team', c => {
    const members: V4StaffMember[] = [...configured.entries()].map(([email, role]) => ({ email, role, addedAt: null, addedBy: null }))
    for (const row of listMembers.all() as Pick<V4StaffMember, 'email' | 'addedAt' | 'addedBy'>[]) {
      if (!configured.has(row.email)) members.push({ ...row, role: 'staff' })
    }
    return c.json({ members })
  })
  protectedRoutes.post('/team', smallBody, async c => {
    const body = await jsonBody(c.req.raw)
    const email = normalizeStaffEmail(body?.email)
    if (!email) return c.json({ message: 'Укажите корректный email' }, 400)
    const addedAt = now()
    const addedBy = c.var.staff.email
    if (configured.has(email) || !addMember.run(email, addedAt, addedBy).changes) {
      return c.json({ message: 'У этого адреса уже есть доступ' }, 409)
    }
    const member: V4StaffMember = { email, role: 'staff', addedAt, addedBy }
    return c.json({ member }, 201)
  })
  protectedRoutes.post('/logout', c => {
    if (getCookie(c, accountCookie)) {
      db.prepare('delete from mvp_sessions where token_hash=?').run(tokenHash(c.var.token))
      deleteCookie(c, accountCookie, {path:'/api'})
    }
    deleteSession.run(tokenHash(c.var.token))
    deleteCookie(c, cookie, { path, sameSite: 'Strict' })
    return c.json({ status: 'signed-out' })
  })
  protectedRoutes.post('/submissions/search', smallBody, async c => {
    const body = await jsonBody(c.req.raw)
    const q = typeof body?.query === 'string' ? body.query.trim().slice(0, 120).toLowerCase() : ''
    const args = [q, q, q, q] as const
    const { total } = count.get(...args) as { total: number }
    const page = typeof body?.page === 'number' && Number.isSafeInteger(body.page) ? body.page : 1
    const last = Math.max(1, Math.ceil(total / v4StaffPageSize))
    const offset = (Math.max(1, Math.min(last, Math.floor(page))) - 1) * v4StaffPageSize
    const rows = list.all(...args, v4StaffPageSize, offset) as (Omit<V4SubmissionSummary,'status'> & {until:string})[]
    return c.json({ items:rows.map(({until,...row})=>({...row,status:readPartnerCampaign(row.id,until).status})), total })
  })
  protectedRoutes.get('/submissions/:id', c => {
    const id = c.req.param('id')
    const row = details.get(id) as { submittedAt: number; data: string } | undefined
    if (!row) return c.json({ message: 'Кампания не найдена' }, 404)
    const { mvp, mvpProfile, business, contactName, setupMode, partnerDetails, registryDetails, email, addresses, online, offer, audience, audienceCity, triggers, offerAccepted, offerImage, logoImage } = JSON.parse(row.data) as IntakeData
    const review=readReview(id)
    const result: V4Submission = { id, marketCopy:mvp && campaignCardCopy(id,review.erid),contract:contractForSubmission(id),status:readPartnerCampaign(id,offer.until).status, review, mvp, mvpProfile, submittedAt: row.submittedAt, business, contactName, setupMode, partnerDetails, registryDetails, email, addresses, online, offer, audience, audienceCity, triggers,
      offerAccepted, offerImage: offerImage?.name ?? null, logoImage: logoImage?.name ?? null }
    return c.json(result)
  })
  protectedRoutes.post('/submissions/:id/review', smallBody, async c => {
    const result = updateReview(c.req.param('id'), c.var.staff.email, await jsonBody(c.req.raw))
    return result.error ? c.json({message:result.error},result.status) : c.json(result)
  })
  protectedRoutes.post('/submissions/:id/registry', async c => {
    const id = c.req.param('id')
    const row = submissionRegistry.get(id) as { inn: string; snapshot: string | null } | undefined
    if (!row) return c.json({ message: 'Кампания не найдена' }, 404)
    if (row.snapshot) return c.json(JSON.parse(row.snapshot) as RegistryDetails)
    let registry = readPartnerRegistry(row.inn, now())
    if (!registry) {
      const response = await lookupRegistry(row.inn).catch(() => null)
      switch (response?.status) {
        case 200: registry = readPartnerRegistry(row.inn, now()); break
        case 400: return c.json({ message: 'В кампании указан некорректный ИНН.' }, 400)
        case 404: return c.json({ message: 'DaData не нашла организацию или ИП с этим ИНН.' }, 404)
        case 409: return c.json({ message: 'По данным DaData бизнес не является действующим. Проверьте реквизиты.' }, 409)
        case 429: return c.json({ message: 'Достигнут лимит запросов к DaData. Повторите через минуту.' }, 429)
      }
      if (!registry) return c.json({ message: 'Не удалось получить реквизиты из DaData. Попробуйте позже.' }, 503)
    }
    if (attachRegistry.run(JSON.stringify(registry), id).changes) return c.json(registry)
    const saved = submissionRegistry.get(id) as { snapshot: string } | undefined
    return saved ? c.json(JSON.parse(saved.snapshot) as RegistryDetails) : c.json({ message: 'Кампания не найдена' }, 404)
  })
  protectedRoutes.get('/submissions/:id/:asset', c => {
    const asset = c.req.param('asset')
    if (asset !== 'offer-image' && asset !== 'logo') return c.json({ message: 'Файл не найден' }, 404)
    const row = details.get(c.req.param('id')) as { data: string } | undefined
    const data = row ? JSON.parse(row.data) as IntakeData : undefined
    const file = asset === 'offer-image' ? data?.offerImage : data?.logoImage
    const extension = file && imageExtension(file.type)
    if (!file || !extension) return c.json({ message: 'Файл не найден' }, 404)
    if (c.req.query('download') === '1') c.header('Content-Disposition', `attachment; filename="${asset}.${extension}"`)
    return c.body(Buffer.from(file.base64, 'base64'), 200, {
      'Content-Type': file.type, 'Content-Security-Policy': "default-src 'none'; sandbox",
    })
  })
  return routes.route('/', protectedRoutes)
}
