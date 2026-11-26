import { validPartnerDraft } from '../shared/partner-campaign-draft.ts'
import { marketResponseReport } from './market-responses.ts'
import { dashboardSearchParams, reportPeriod } from '../shared/cabinet-dashboard.ts'
import { cabinetOverview, cabinetList } from './cabinet-dashboard.ts'
import { siteSearch } from './site-search.ts'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { offerAi } from './offer-ai.ts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { innError, normalizeBusinessWebsite } from '../shared/campaign-business.ts'
import { audienceGroups, emptyCampaignDraft, normalizeCampaignEmail } from '../shared/campaign-draft.ts'
import { designs, submittedTargeting, validPromo, type MvpSession, type Profile, type Promo, type ReceiptSummary } from '../shared/mvp-promo.ts'
import { consumeCampaignCode, draftKeyPattern, issueEmailCode } from './campaign-email.ts'
import { packImage, type IntakeData } from './campaign-intake.ts'
import { posterSource } from '../shared/partner-poster.ts'
import { db } from './db.ts'
import { campaignCardCopy, readPartnerCampaign, readReview } from './market.ts'
import { promoOffer } from '../shared/campaign-market.ts'
import type { PreviewInbox } from './preview-inbox.ts'
import { staffRole } from './staff-role.ts'
import { partnerContracts, contractForSubmission, type ContractSender } from './campaign-contracts.ts'
import { sendContractDocument } from './campaign-mail.ts'
import { readPartnerRegistry } from './partner-registry.ts'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
export const accountCookie = 'platform_session'
const cookie = accountCookie
const path = '/api'
const limit = (maxSize: number) => bodyLimit({ maxSize, onError: c => c.json({ message: 'Слишком большой запрос' }, 413) })
const validText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
const activeSession = db.prepare('select a.email, a.profile from mvp_sessions s join mvp_accounts a on a.email=s.email where token_hash=? and expires_at>?')
const receipt = db.prepare('select s.data, s.submitted_at from campaign_owners r join v4_submissions s using(id) where r.email=? and r.id=?')

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

export function createMvp(send: (email: string, code: string) => Promise<void>, roleFor = staffRole, inbox?:PreviewInbox, sendDocument:ContractSender=sendContractDocument) {
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
      const account = db.prepare('insert or ignore into mvp_accounts(email) values (?)').run(email)
      if (account.changes && !roleFor(email)) db.prepare('insert into partner_authorizations values (?,?)').run(email, now)
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
  app.get('/session', c => {
    const session=c.var.session
    const draft=!session.role && !session.profile && db.prepare('select 1 from partner_campaign_drafts where email=? limit 1').get(session.email)
    return c.json(draft?{...session,hasDrafts:true}:session)
  })
  app.post('/logout', limit(1024), c => {
    db.prepare('delete from mvp_sessions where token_hash=?').run(hash(getCookie(c, cookie) ?? getCookie(c, 'mvp_partner') ?? ''))
    deleteCookie(c, cookie, { path })
    deleteCookie(c, 'mvp_partner', { path:'/api/mvp' })
    deleteCookie(c, 'v4_staff', { path:'/api/v4/staff' })
    return c.json({ status: 'signed-out' })
  })
  app.use('*', async (c,next) => c.var.session.role ? c.json({message:'Для сотрудников доступен кабинет проверки заявок'},403) : next())
  app.route('/contracts',partnerContracts(sendDocument))
  app.route('/',siteSearch)
  app.get('/drafts', c => {
    const {email,profile}=c.var.session
    return c.json(db.prepare(`select id,json_extract(data,'$.promo.code') code,json_extract(data,'$.promo.cond') title,
      json_extract(data,'$.step') step,updated_at updatedAt from partner_campaign_drafts
      where email=? and (inn is null or inn=?) order by updated_at desc,id`).all(email,profile?.inn??null))
  })
  app.get('/drafts/:id', c => {
    const {email,profile}=c.var.session
    const row=db.prepare('select data,version,updated_at updatedAt,inn,email from partner_campaign_drafts where id=?').get(c.req.param('id'))
    if (!row) return c.json(null)
    if (row.email!==email || row.inn && row.inn!==profile?.inn) return c.json({message:'Черновик недоступен для текущей компании.'},404)
    return c.json({data:JSON.parse(String(row.data)),version:row.version,updatedAt:row.updatedAt})
  })
  app.post('/drafts/:id',limit(4_950_000),async c=>{
    const id=c.req.param('id'), {email,profile}=c.var.session
    const b=await c.req.json().catch(()=>null)
    if(b?.keepAttachment && b.data?.contractInput) {
      const stored=db.prepare("select json_extract(data,'$.contractInput.attachment') file from partner_campaign_drafts where id=? and email=? and (inn is null or inn=?)").get(id,email,profile?.inn??null)
      if(!stored?.file)return c.json({message:'Приложение изменилось. Откройте сохранённую версию.'},409)
      b.data.contractInput.attachment=JSON.parse(String(stored.file))
    }
    if (!draftKeyPattern.test(id)||!Number.isSafeInteger(b?.version)||b.version<0||!validPartnerDraft(b.data))
      return c.json({message:'Проверьте данные черновика.'},422)
    const contract=db.prepare('select email,inn,submission_id from campaign_contracts where id=?').get(id)
    if (contract && (contract.email!==email || contract.inn!==profile?.inn)) return c.json({message:'Черновик недоступен.'},404)
    if (contract?.submission_id) return c.json({message:'Кампания уже передана. Откройте её в кабинете.'},409)
    const updatedAt=Date.now(), data=JSON.stringify(b.data), inn=profile?.inn??null
    const saved=b.version===0
      ? db.prepare('insert or ignore into partner_campaign_drafts values(?,?,?,?,1,?)').run(id,email,inn,data,updatedAt)
      : db.prepare('update partner_campaign_drafts set data=?,inn=coalesce(inn,?),version=version+1,updated_at=? where id=? and email=? and (inn is null or inn=?) and version=?').run(data,inn,updatedAt,id,email,inn,b.version)
    if (!saved.changes) {
      const old=db.prepare('select data,version,updated_at from partner_campaign_drafts where id=? and email=? and (inn is null or inn=?)').get(id,email,inn)
      if(old && old.version===b.version+1 && old.data===data) return c.json({version:old.version,updatedAt:old.updated_at})
      return c.json({message:'Черновик изменён в другой вкладке. Откройте сохранённую версию.'},409)
    }
    return c.json({version:b.version+1,updatedAt})
  })
  app.post('/company', limit(4096), async c => {
    const p = await c.req.json().catch(() => null)
    if (!p || typeof p.inn !== 'string' || innError(p.inn) || !validText(p.company, 2, 80) || !validText(p.addr, 0, 200)) return c.json({ message: 'Проверьте ИНН и название компании' }, 400)
    const website = typeof p.website === 'string' ? normalizeBusinessWebsite(p.website) : ''
    const profile: Profile = { ...(validText(p.category,1,100) && {category:p.category.trim()}), ...(website && {website}), inn: p.inn, company: p.company.trim(), addr: p.addr.trim() }
    const current=c.var.session
    db.exec('begin immediate')
    try {
      if(p.draftId!==undefined){
        const selected=typeof p.draftId==='string' && draftKeyPattern.test(p.draftId) && Number.isSafeInteger(p.draftVersion) &&
          db.prepare(`update partner_campaign_drafts set inn=? where id=? and email=? and version=? and (inn is null or inn=?)
            and json_extract(data,'$.contractInput.inn')=? and not exists (select 1 from campaign_contracts where id=?)`)
          .run(profile.inn,p.draftId,current.email,p.draftVersion,current.profile?.inn??null,profile.inn,p.draftId).changes
        if(!selected){
          db.exec('rollback')
          return c.json({message:'Черновик изменился. Откройте сохранённую версию и подтвердите ИНН.'},409)
        }
      } else if(!current.profile){
        db.prepare('update partner_campaign_drafts set inn=? where email=? and inn is null').run(profile.inn,current.email)
      }
      db.prepare('update mvp_accounts set profile=? where email=?').run(JSON.stringify(profile),current.email)
      db.exec('commit')
    }catch(error){db.exec('rollback');throw error}
    return c.json({ ...c.var.session, profile })
  })
  // Verified partners prepare their offer before identifying the company in the contract step.
  app.route('/',offerAi)
  // Both intake paths verify the submitter's email. Limit print assets to the active company.
  const posterOwner = "lower(json_extract(s.data,'$.email'))=? and json_extract(s.data,'$.business.inn')=?"
  const posterList = db.prepare(`select s.id, json_extract(s.data,'$.offer.title') title, json_extract(s.data,'$.offer.promo') code
    from v4_submissions s where ${posterOwner} order by s.submitted_at desc, s.id desc limit 26 offset ?`)
  const posterDetail = db.prepare(`select s.data,e.patch from v4_submissions s left join market_edits e on e.entry_key=s.id
    where s.id=? and ${posterOwner}`)
  app.get('/poster-sources', c => {
    const {email,profile} = c.var.session
    const offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) return c.json({message:'Некорректная страница'},400)
    const rows = profile ? posterList.all(email,profile.inn,offset) : []
    return c.json({items:rows.slice(0,25),more:rows.length>25})
  })
  app.get('/poster-sources/:id', c => {
    const {email,profile} = c.var.session
    const row = profile && posterDetail.get(c.req.param('id'), email, profile.inn)
    if (!row) return c.json({message:'Кампания не найдена в текущей компании'},404)
    const data: IntakeData = JSON.parse(String(row.data))
    const imageUrl = (file:IntakeData['offerImage']) => file ? 'data:'+file.type+';base64,'+file.base64 : ''
    const design = designs.find(d => d.file === data.mvp?.design)
    const advertiser=contractForSubmission(c.req.param('id'))?.company || data.business.name
    return c.json(posterSource({...data.business,name:advertiser}, data.offer, imageUrl(data.offerImage) || (design ? '/img/offer-variants/'+design.file : ''),
      imageUrl(data.logoImage), {brand:data.mvp?.brandName,...(row.patch ? JSON.parse(String(row.patch)).catalog : {})}))
  })
  app.get('/notifications', c => {
    const email = c.var.session.email
    const before = Number(c.req.query('before') ?? 0)
    if (!Number.isSafeInteger(before) || before < 0) return c.json({message:'Некорректная страница'},400)
    const items = db.prepare(`select event_id eventId,submission_id id,title,previous fromStage,stage toStage,created_at createdAt
      from campaign_stage_events where recipient=? and (?=0 or event_id<?) order by event_id desc limit 26`).all(email,before,before)
    const {unread} = db.prepare('select count(*) unread from campaign_stage_events where recipient=? and read_at is null').get(email)!
    return c.json({items:items.slice(0,25),more:items.length>25,unread})
  })
  app.post('/notifications/read', limit(256), async c => {
    const through = (await c.req.json().catch(()=>null))?.through
    if (!Number.isSafeInteger(through) || through<1) return c.json({message:'Некорректное уведомление'},400)
    db.prepare('update campaign_stage_events set read_at=? where recipient=? and event_id<=? and read_at is null').run(Date.now(),c.var.session.email,through)
    return c.json({ok:true})
  })
  app.get('/statistics/responses', c => {
    const days=reportPeriod(c.req.query('days') ?? '7')
    return days ? c.json(marketResponseReport(c.var.session.email,days)) : c.json({message:'Выберите 7, 30 или 90 дней'},400)
  })
  app.get('/dashboard', c => c.json(cabinetOverview(c.var.session.email)))
  app.post('/dashboard/rows', limit(4096), async c => c.json(cabinetList(dashboardSearchParams(await c.req.json().catch(()=>null)), c.var.session.email)))
  app.get('/campaigns', c => {
    const offset = Number(c.req.query('offset') ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) return c.json({ message: 'Некорректная страница' }, 400)
    const rows = db.prepare(`select s.id, json_extract(s.data,'$.offer.promo') code, json_extract(s.data,'$.business.name') company, json_extract(s.data,'$.offer.until') until, s.submitted_at submittedAt
      from campaign_owners r join v4_submissions s using(id) where r.email=? order by s.submitted_at desc,s.id desc limit 26 offset ?`).all(c.var.session.email, offset) as (Omit<ReceiptSummary,'status'> & {until:string})[]
    return c.json({ items: rows.slice(0,25).map(({until,...row}) => ({...row,status:readPartnerCampaign(row.id,until).status})), more: rows.length > 25 })
  })
  app.get('/campaigns/:id', c => {
    const row = receipt.get(c.var.session.email, c.req.param('id')) as { data: string; submitted_at: number } | undefined
    if (!row) return c.json({ message: 'Кампания не найдена' }, 404)
    const { mvp, mvpProfile, business, offerImage, logoImage, offer } = JSON.parse(row.data) as IntakeData
    const {status,publicId} = readPartnerCampaign(c.req.param('id'),offer.until)
    const id=c.req.param('id')
    return c.json({ id, marketCopy:campaignCardCopy(id,readReview(id).erid),contract:contractForSubmission(id,c.var.session.email),status,publicId, profile: mvpProfile ?? { inn: business.inn, company: business.name, addr: '' }, submittedAt: row.submitted_at,
      promo: { ...(mvp ?? {code:offer.promo, off:offer.discount, cond:offer.title, till:offer.until, site:business.website}), ...(offerImage && { photo: { name: offerImage.name, src: 'data:' + offerImage.type + ';base64,' + offerImage.base64 } }),
        ...(logoImage && {logo:{name:logoImage.name,src:'data:'+logoImage.type+';base64,'+logoImage.base64}}) } })
  })
  app.post('/campaigns', limit(730_000), async c => {
    const { email, profile } = c.var.session
    const body = await c.req.json().catch(() => null)
    if (!profile || profile.inn !== body?.inn || typeof body.key !== 'string' || !draftKeyPattern.test(body.key) || !validPromo(body.promo)) {
      return c.json({ message: 'Проверьте компанию и условия кампании' }, 422)
    }
    const p: Promo = body.promo
    let offerImage: IntakeData['offerImage'], logoImage:IntakeData['logoImage']
    try { [offerImage,logoImage] = await Promise.all([readPhoto(p.usePhoto===false?undefined:p.photo),readPhoto(p.logo)]) } catch { return c.json({ message: 'Проверьте формат фото и логотипа.' }, 422) }
    const target = submittedTargeting(p)
    const promo = { code: p.code, cond: p.cond.trim(), off: p.off, site: p.site.trim(), till: p.till, fee: p.fee, check: p.check, via: p.via, design: p.design,
      ...(p.brandName?.trim() && {brandName:p.brandName.trim()}), ...(p.activity?.trim() && {activity:p.activity.trim()}), ...target }
    const draft = emptyCampaignDraft()
    const audience = [target.area, target.gender, target.age, target.income, target.moment].map((v, i) => Math.max(0, audienceGroups[i].choices.indexOf(v ?? '')))
    const data: IntakeData = { ...draft, email, business: { ...draft.business, inn: profile.inn, name: profile.company, category:promo.activity || profile.category || '', website: promo.site },
      addresses: target.addresses ?? [], online: !!target.online, audience, audienceCity: target.city, triggers: target.wishes ?? '',
      confirmedInn: profile.inn, filled: true, stage: 5, reached: 5, offerAccepted: true, offerImage, logoImage, mvp: promo, mvpProfile: profile,
      offer: promoOffer(promo) }
    const key = 'mvp:' + hash(email) + ':' + body.key
    const digest = hash(JSON.stringify(data))
    const now = Date.now()
    db.exec('begin immediate')
    try {
      const existing = db.prepare('select id from v4_submissions where draft_id=? and digest=?').get(key, digest)
      if (existing) { db.exec('commit'); return c.json({ id: existing.id, created: false }) }
      const savedDraft=db.prepare('select version,email,inn from partner_campaign_drafts where id=?').get(body.key)
      if(savedDraft && (savedDraft.email!==email || savedDraft.inn && savedDraft.inn!==profile.inn || savedDraft.version!==body.draftVersion)) {
        db.exec('rollback')
        return c.json({message:'Черновик изменился. Откройте сохранённую версию перед запуском.'},409)
      }
      const contract=db.prepare('select signed_at,submission_id from campaign_contracts where id=? and email=? and inn=?').get(body.key,email,profile.inn)
      if (!contract || (!contract.signed_at && body.awaitSignature!==true)) {
        db.exec('rollback')
        return c.json({message:'Для запуска с переходом на модерацию нужен подписанный договор этой кампании.'},422)
      }
      if (contract.submission_id) {
        db.exec('rollback')
        return c.json({message:'Кампания с этим договором уже запущена. Откройте её в кабинете.'},409)
      }
      const count = db.prepare('select count(*) as n from v4_submissions where submitted_at>?').get(now - 60_000)!
      if (Number(count.n) >= 30) { db.exec('rollback'); return c.json({ message: 'Слишком много заявок. Повторите через минуту' }, 429) }
      const id = randomUUID()
      data.offerAccepted=!!contract.signed_at
      data.registryDetails = readPartnerRegistry(profile.inn, now)
      db.prepare('insert into v4_submissions(id,draft_id,digest,data,submitted_at,mail_next_at) values (?,?,?,?,?,?)').run(id,key,digest,JSON.stringify(data),now,now)
      db.prepare('insert into mvp_receipts values (?,?)').run(id,email)
      db.prepare('delete from partner_campaign_drafts where id=? and email=?').run(body.key,email)
      db.prepare('update campaign_contracts set submission_id=? where id=?').run(id,body.key)
      db.prepare('insert into campaign_workflow values (?,?)').run(id,contract.signed_at?'review':'contract')
      db.exec('commit')
      return c.json({ id, created: true }, 201)
    } catch (e) { db.exec('rollback'); throw e }
  })
  return app
}
