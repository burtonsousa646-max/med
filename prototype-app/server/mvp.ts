import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { innError, normalizeBusinessWebsite } from '../shared/campaign-business.ts'
import { audienceGroups, emptyCampaignDraft, normalizeCampaignEmail } from '../shared/campaign-draft.ts'
import { designs, submittedTargeting, validPromo, type MvpSession, type Profile, type Promo, type ReceiptSummary } from '../shared/mvp-promo.ts'
import { consumeCampaignCode, draftKeyPattern, issueEmailCode } from './campaign-email.ts'
import { packImage, type IntakeData } from './campaign-intake.ts'
import { db } from './db.ts'
import { readPartnerCampaign } from './market.ts'
import type { PreviewInbox } from './preview-inbox.ts'
import { staffRole } from './staff-role.ts'
import { readPartnerRegistry } from './partner-registry.ts'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
export const accountCookie = 'platform_session'
const cookie = accountCookie
const path = '/api'
const limit = (maxSize: number) => bodyLimit({ maxSize, onError: c => c.json({ message: 'Слишком большой запрос' }, 413) })
const validText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
const activeSession = db.prepare('select a.email, a.profile from mvp_sessions s join mvp_accounts a on a.email=s.email where token_hash=? and expires_at>?')
const receipt = db.prepare('select s.data, s.submitted_at from mvp_receipts r join v4_submissions s using(id) where r.email=? and r.id=?')

export function accountSession(token: string | undefined, now = Date.now()) {
  if (!token || !/^[\w-]{43}$/.test(token)) return undefined
  return activeSession.get(hash(token), now) as {email: string; profile: string | null} | undefined
}

async function readPhoto(photo: Promo['photo']) {
  if (photo === undefined) return null
  if (!photo || !validText(photo.name, 1, 255) || typeof photo.src !== 'string' || photo.src.length > 550_000) throw new Error('photo')
  const match = /^data:(image\/(?:webp|png));base64,([a-z0-9+/]+=*)$/i.exec(photo.src)
  if (!match) throw new Error('photo')
  return packImage(new File([new Uint8Array(Buffer.from(match[2], 'base64'))], photo.name, { type: match[1] }))
}

export function createMvp(send: (email: string, code: string) => Promise<void>, roleFor = staffRole, inbox?:PreviewInbox) {
  const app = new Hono<{ Variables: { session: MvpSession } }>()
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store')
    c.header('X-Content-Type-Options', 'nosniff')
    if (c.req.method === 'POST' && c.req.header('Content-Type')?.split(';')[0] !== 'application/json') {
      return c.json({ message: 'Ожидается JSON' }, 415)
    }
    await next()
  })
  app.post('/code', limit(1024), async c => {
    const body = await c.req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? normalizeCampaignEmail(body.email).toLowerCase() : ''
    if (!email) return c.json({ message: 'Укажите корректную почту' }, 400)
    const challenge = randomUUID()
    const fixture = inbox?.addresses.includes(email)
    const error = fixture
      ? await issueEmailCode('mvp-test:' + challenge,email,async (address,code)=>inbox!.deliver(address,code,challenge))
      : await issueEmailCode('mvp:' + challenge,email,send)
    return error ? c.json({ message:error.message }, error.status) : c.json({challenge})
  })
  app.post('/verify', limit(1024), async c => {
    const body = await c.req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? normalizeCampaignEmail(body.email).toLowerCase() : ''
    if (!email || !draftKeyPattern.test(body?.challenge) || typeof body?.code !== 'string' || !/^\d{6}$/.test(body.code)) return c.json({ message: 'Проверьте почту и код' }, 400)
    const token = randomBytes(32).toString('base64url')
    const now = Date.now()
    db.exec('begin immediate')
    try {
      const prefix = inbox?.addresses.includes(email) ? 'mvp-test:' : 'mvp:'
      const error = consumeCampaignCode(prefix + body.challenge, email, body.code, hash(token), now)
      if (error) { db.exec('commit'); return c.json({ message: error }, 401) }
      db.prepare('insert or ignore into mvp_accounts(email) values (?)').run(email)
      db.prepare('delete from mvp_sessions where expires_at<=? or token_hash=?').run(now, hash(getCookie(c, cookie) ?? ''))
      db.prepare('insert into mvp_sessions values (?,?,?)').run(hash(token), email, now + 8 * 3600_000)
      db.exec('commit')
    } catch (e) { db.exec('rollback'); throw e }
    inbox?.forget(body.challenge)
    setCookie(c, cookie, token, { path, httpOnly: true, sameSite: 'Strict', secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', maxAge: 8 * 3600 })
    deleteCookie(c, 'mvp_partner', { path:'/api/mvp' })
    deleteCookie(c, 'v4_staff', { path:'/api/v4/staff' })
    return c.json({ status: 'verified' })
  })
  app.use('*', async (c, next) => {
    const row = accountSession(getCookie(c, cookie) ?? getCookie(c, 'mvp_partner'))
    if (!row) return c.json({ message: 'Войдите по рабочей почте' }, 401)
    if (c.req.header('X-Mvp-Account') && c.req.header('X-Mvp-Account') !== row.email) return c.json({ message: 'Аккаунт изменился. Обновите страницу' }, 409)
    const role = roleFor(row.email)
    if (role && !getCookie(c,cookie)) return c.json({message:'Подтвердите почту для входа сотрудника'},401)
    c.set('session', { ...(role && {role}), email: row.email, profile: row.profile ? JSON.parse(row.profile) : null })
    await next()
  })
  app.get('/session', c => c.json(c.var.session))
  app.post('/logout', limit(1024), c => {
    db.prepare('delete from mvp_sessions where token_hash=?').run(hash(getCookie(c, cookie) ?? getCookie(c, 'mvp_partner') ?? ''))
    deleteCookie(c, cookie, { path })
    deleteCookie(c, 'mvp_partner', { path:'/api/mvp' })
    deleteCookie(c, 'v4_staff', { path:'/api/v4/staff' })
    return c.json({ status: 'signed-out' })
  })
  app.use('*', async (c,next) => c.var.session.role ? c.json({message:'Для сотрудников доступен кабинет проверки заявок'},403) : next())
  app.post('/company', limit(4096), async c => {
    const p = await c.req.json().catch(() => null)
    if (!p || typeof p.inn !== 'string' || innError(p.inn) || !validText(p.company, 2, 80) || !validText(p.addr, 0, 200)) return c.json({ message: 'Проверьте ИНН и название компании' }, 400)
    const website = typeof p.website === 'string' ? normalizeBusinessWebsite(p.website) : ''
    const profile: Profile = { ...(validText(p.category,1,100) && {category:p.category.trim()}), ...(website && {website}), inn: p.inn, company: p.company.trim(), addr: p.addr.trim() }
    db.prepare('update mvp_accounts set profile=? where email=?').run(JSON.stringify(profile), c.var.session.email)
    return c.json({ ...c.var.session, profile })
  })
  app.get('/campaigns', c => {
    const offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) return c.json({ message: 'Некорректная страница' }, 400)
    const rows = db.prepare(`select s.id, json_extract(s.data,'$.offer.promo') code, json_extract(s.data,'$.business.name') company, json_extract(s.data,'$.offer.until') until, s.submitted_at submittedAt
      from mvp_receipts r join v4_submissions s using(id) where r.email=? order by s.submitted_at desc,s.id desc limit 26 offset ?`).all(c.var.session.email, offset) as (Omit<ReceiptSummary,'status'> & {until:string})[]
    return c.json({ items: rows.slice(0,25).map(({until,...row}) => ({...row,status:readPartnerCampaign(row.id,until).status})), more: rows.length > 25 })
  })
  app.get('/campaigns/:id', c => {
    const row = receipt.get(c.var.session.email, c.req.param('id')) as { data: string; submitted_at: number } | undefined
    if (!row) return c.json({ message: 'Кампания не найдена' }, 404)
    const { mvp, mvpProfile, business, offerImage, offer } = JSON.parse(row.data) as IntakeData
    const {status,publicId} = readPartnerCampaign(c.req.param('id'),offer.until)
    return c.json({ id: c.req.param('id'), status,publicId, profile: mvpProfile ?? { inn: business.inn, company: business.name, addr: '' }, submittedAt: row.submitted_at,
      promo: { ...mvp, ...(offerImage && { photo: { name: offerImage.name, src: 'data:' + offerImage.type + ';base64,' + offerImage.base64 } }) } })
  })
  app.post('/campaigns', limit(650_000), async c => {
    const { email, profile } = c.var.session
    const body = await c.req.json().catch(() => null)
    if (!profile || profile.inn !== body?.inn || body?.accepted !== true || typeof body.key !== 'string' || !draftKeyPattern.test(body.key) || !validPromo(body.promo)) {
      return c.json({ message: 'Проверьте компанию, условия и согласие с офертой' }, 422)
    }
    const p: Promo = body.promo
    let offerImage: IntakeData['offerImage']
    try { offerImage = await readPhoto(p.photo) } catch { return c.json({ message: 'Выберите корректное изображение' }, 422) }
    const target = submittedTargeting(p)
    const promo = { code: p.code, cond: p.cond.trim(), off: p.off, site: p.site.trim(), till: p.till, fee: p.fee, check: p.check, via: p.via, design: p.design, ...target }
    const draft = emptyCampaignDraft()
    const audience = [target.area, target.gender, target.age, target.income, target.moment].map((v, i) => Math.max(0, audienceGroups[i].choices.indexOf(v ?? '')))
    const data: IntakeData = { ...draft, email, business: { ...draft.business, inn: profile.inn, name: profile.company, category:profile.category ?? '', website: promo.site },
      addresses: target.addresses ?? [], online: !!target.online, audience, audienceCity: target.city, triggers: target.wishes ?? '',
      confirmedInn: profile.inn, filled: true, stage: 5, reached: 5, offerAccepted: true, offerImage, logoImage: null, mvp: promo, mvpProfile: profile,
      offer: { ...draft.offer, title: promo.cond || 'Скидка по промокоду', promo: promo.code, discount: promo.off, until: promo.till, tone: designs.find(d => d.file === promo.design)!.tone } }
    const key = 'mvp:' + hash(email) + ':' + body.key
    const digest = hash(JSON.stringify(data))
    const now = Date.now()
    db.exec('begin immediate')
    try {
      const existing = db.prepare('select id from v4_submissions where draft_id=? and digest=?').get(key, digest)
      if (existing) { db.exec('commit'); return c.json({ id: existing.id, created: false }) }
      const count = db.prepare('select count(*) as n from v4_submissions where submitted_at>?').get(now - 60_000)!
      if (Number(count.n) >= 30) { db.exec('rollback'); return c.json({ message: 'Слишком много заявок. Повторите через минуту' }, 429) }
      const id = randomUUID()
      data.registryDetails = readPartnerRegistry(profile.inn, now)
      db.prepare('insert into v4_submissions(id,draft_id,digest,data,submitted_at,mail_next_at) values (?,?,?,?,?,?)').run(id,key,digest,JSON.stringify(data),now,now)
      db.prepare('insert into mvp_receipts values (?,?)').run(id,email)
      db.exec('commit')
      return c.json({ id, created: true }, 201)
    } catch (e) { db.exec('rollback'); throw e }
  })
  return app
}
