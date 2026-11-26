import { initializeMarketResponses, observePublication } from './market-responses.ts'
import { randomUUID } from 'node:crypto'
import { bodyLimit } from 'hono/body-limit'
import { initializeMarketCatalog, searchMarket, staffCatalogRecord } from './market-catalog.ts'
import { Hono } from 'hono'
import { db } from './db.ts'
import { promoDay, type Receipt } from '../shared/mvp-promo.ts'
import { campaignMarketCard } from '../shared/campaign-market.ts'
import { campaignLabels } from '../shared/cabinet-dashboard.ts'
import type { PartnerCampaignStatus } from '../shared/mvp-promo.ts'
import type { MarketOffer, Review } from '../shared/market.ts'
import type { IntakeData } from './campaign-intake.ts'

db.exec(`create table if not exists market_publications (
  submission_id text primary key references v4_submissions(id) on delete cascade, public_id text not null unique,
  reviewed integer not null, paid integer not null, erid text not null, version integer not null,
  updated_by text not null, updated_at integer not null, published_at integer, until_day text not null, card text
);
create index if not exists market_live on market_publications(published_at desc,public_id) where published_at is not null;
create table if not exists market_withdrawals (
  submission_id text primary key references market_publications(submission_id) on delete cascade
);
create table if not exists market_selections (
  public_id text not null, selection_key text not null, primary key (public_id, selection_key)
) without rowid`)

db.exec(`create temp view campaign_stage_state as
  select s.id, coalesce(p.version,0) version, case
    when nullif(json_extract(s.data,'$.offer.until'),'') < date('now','+3 hours')
      or (p.published_at is not null and nullif(p.until_day,'') < date('now','+3 hours')) then 'archived'
    when f.stage='authorization' then 'review' when f.stage is not null then f.stage when p.published_at is not null then 'published'
    when w.submission_id is not null then 'stopped' when p.reviewed=1 and p.paid=0 and p.erid<>'' then 'contract'
    else 'review' end status from v4_submissions s left join market_publications p on p.submission_id=s.id
    left join campaign_workflow f on f.id=s.id left join market_withdrawals w on w.submission_id=s.id`)
initializeMarketCatalog()
initializeMarketResponses()

type Row = {public_id:string; reviewed:number; paid:number; erid:string; version:number; until_day:string; published_at:number|null}
const select = db.prepare('select public_id,reviewed,paid,erid,version,until_day,published_at from market_publications where submission_id=?')
const live = "published_at is not null and (until_day='' or until_day>=?)"
export function readReview(id: string): Review {
  const row = select.get(id) as Row | undefined
  if (!row) return {reviewed:false, paid:false, erid:'', version:0, publicId:null, status:'review'}
  const expired = !!row.until_day && row.until_day < promoDay()
  const status = row.published_at !== null ? expired ? 'expired' : 'published' : row.reviewed && row.erid && !row.paid ? 'awaiting_payment' : 'review'
  return {reviewed:!!row.reviewed, paid:!!row.paid, erid:row.erid, version:row.version, publicId:status === 'published' ? row.public_id : null, status}
}
const state = db.prepare('select status,version from campaign_stage_state where id=?')
export function readPartnerCampaign(id:string, _until:string): Pick<Receipt,'status'|'publicId'> {
  const row = state.get(id) as {status:PartnerCampaignStatus}
  return {status:row.status, publicId:row.status==='published' ? readReview(id).publicId : null}
}

export function campaignCardCopy(id:string, erid:string) {
  const record=staffCatalogRecord(id)
  if (!record) return undefined
  const {brand,benefit,condition}=record.fields
  return {catalog:{brand,benefit,condition},erid}
}

export function updateReview(id: string, employee: string, value: unknown) {
  const request = value as Partial<Review> | null
  if (!request || typeof request.reviewed !== 'boolean' || typeof request.paid !== 'boolean'
    || typeof request.erid !== 'string' || !/^(?:[A-Za-z0-9]{1,100})?$/.test(request.erid)
    || !Number.isSafeInteger(request.version) || request.version! < 0) return {error:'Проверьте отметки и erid',status:400 as const}
  return updateCampaign(id, employee, request.version!, {reviewed:request.reviewed, paid:request.paid, erid:request.erid})
}

export function moveCampaign(id:string, employee:string, value:unknown) {
  const request = value as {status?:string;version?:number} | null
  if (!request || typeof request.status !== 'string' || !Object.hasOwn(campaignLabels, request.status)
    || !Number.isSafeInteger(request.version) || request.version! < 0) return {error:'Проверьте этап и версию кампании',status:400 as const}
  if (request.status==='authorization') return {error:'Авторизация доступна клиентам до формирования договора и запуска первой кампании.',status:422 as const}
  return updateCampaign(id,employee,request.version!,undefined,request.status as PartnerCampaignStatus)
}

function updateCampaign(id:string, employee:string, version:number, input?:Pick<Review,'reviewed'|'paid'|'erid'>, target?:PartnerCampaignStatus) {
  const nested=db.isTransaction
  const rollback=nested?'rollback to campaign_update; release campaign_update':'rollback'
  const commit=nested?'release campaign_update':'commit'
  db.exec(nested?'savepoint campaign_update':'begin immediate')
  try {
    const row = db.prepare('select data from v4_submissions where id=?').get(id)
    if (!row) { db.exec(rollback); return {error:'Кампания не найдена',status:404 as const} }
    const old = readReview(id)
    const previous = (state.get(id) as {status:PartnerCampaignStatus}).status
    const {reviewed, paid, erid} = input ?? old
    if (target ? target === previous : old.reviewed === reviewed && old.paid === paid && old.erid === erid) {
      db.exec(commit)
      return {review:old, changed:false}
    }
    if (version !== old.version) { db.exec(rollback); return {error:'Другой сотрудник изменил кампанию. Обновите её и проверьте отметки',status:409 as const} }
    const data = JSON.parse(String(row.data)) as IntakeData
    const ready = reviewed && paid && erid !== ''
    const next = target ?? (ready && (!old.reviewed || !old.paid || !old.erid) ? 'published' : previous==='published' && !ready ? 'stopped' : previous)
    const contract=db.prepare('select signed_at,company from campaign_contracts where submission_id=?').get(id)
    if (contract && !contract.signed_at && !['contract','archived'].includes(next)) {
      db.exec(rollback)
      return {error:'Сначала подтвердите получение подписанного договора в карточке кампании.',status:422 as const}
    }
    const active = next === 'published'
    if (active && !ready) {
      db.exec(rollback)
      return {error:'Чтобы активировать кампанию, откройте карточку кампании, проверьте оффер, укажите erid и подтвердите оплату.',status:422 as const}
    }
    if (target && target !== 'archived' && data.offer.until && data.offer.until < promoDay()) {
      db.exec(rollback)
      return {error:'Срок действия закончился. Для нового периода создайте кампанию на основе этой.',status:422 as const}
    }
    if (active && (!(contract?contract.signed_at:data.offerAccepted) || (data.offer.until && data.offer.until < promoDay()))) {
      db.exec(rollback)
      return {error:'Для публикации нужны действующее предложение и принятая оферта',status:422 as const}
    }
    const prior = select.get(id) as Row | undefined
    if (prior?.published_at != null && !active) db.prepare('insert or ignore into market_withdrawals values (?)').run(id)
    const publicId = prior?.public_id ?? randomUUID()
    const card=campaignMarketCard({id:publicId,name:String(contract?.company || data.business.name),offer:data.offer,erid,
      category:data.business.category,website:data.business.website,partner:data.mvp,online:data.online,addresses:data.addresses,
      image:data.offerImage?'/api/market/offers/'+publicId+'/image':'',logo:data.logoImage?'/api/market/offers/'+publicId+'/logo':''})
    const now = Date.now()
    db.prepare(`insert into market_publications values (?,?,?,?,?,?,?,?,?,?,?)
      on conflict(submission_id) do update set reviewed=excluded.reviewed,paid=excluded.paid,erid=excluded.erid,version=excluded.version,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at,published_at=excluded.published_at,until_day=excluded.until_day,card=excluded.card`)
      .run(id,publicId,+reviewed,+paid,erid,old.version+1,employee,now,active ? prior?.published_at ?? now : null,data.offer.until || '',active ? JSON.stringify(card) : null)
    observePublication(id,active,now)
    db.prepare('insert into campaign_workflow values (?,?) on conflict(id) do update set stage=excluded.stage').run(id,next)
    const current = (state.get(id) as {status:PartnerCampaignStatus}).status
    let missingRecipient=false
    if (previous !== current) {
      const notification=db.prepare(`insert into campaign_stage_events(submission_id,version,previous,stage,employee,recipient,title,created_at,next_at)
        select id,?,?,?,?,nullif(email,''),?,?,? from campaign_owners where id=? returning recipient`).get(old.version+1,previous,current,employee,data.offer.title || data.business.name,now,now,id)
      missingRecipient=!notification?.recipient
    }
    const review = readReview(id)
    db.exec(commit)
    return {review, changed:true, ...(missingRecipient && {warning:'В заявке нет подтверждённой почты партнёра. Отправить письмо не удалось.'})}
  } catch (error) { db.exec(rollback); throw error }
}

export const market = new Hono()
market.use('*', async (c,next) => {
  c.header('Cache-Control','no-store')
  c.header('X-Content-Type-Options','nosniff')
  await next()
})
market.get('/offers', c => {
  const offset = Number(c.req.query('offset') ?? 0)
  if (!Number.isSafeInteger(offset) || offset < 0) return c.json({message:'Некорректная страница'},400)
  const category = c.req.query('category') || ''
  if (category.length > 32) return c.json({message:'Некорректная категория'},400)
  const day = promoDay()
  const rows = db.prepare(`select card from market_catalogue where ${live} and (?='' or json_extract(card,'$.group')=?) order by published_at desc,public_id limit 49 offset ?`).all(day,category,category,offset)
  const totals = db.prepare(`select json_extract(card,'$.group') category, count(*) total from market_catalogue where ${live} group by 1`).all(day)
  const categories = Object.fromEntries(totals.map(row=>[String(row.category),Number(row.total)]))
  return c.json({items:rows.slice(0,48).map(r=>JSON.parse(String(r.card)) as MarketOffer),more:rows.length>48,categories})
})
const liveOffer = db.prepare(`select card from market_catalogue where public_id=? and ${live}`)
const countSelections = db.prepare('select count(*) total from market_selections where public_id=?')
const selectOnce = db.prepare('insert into market_selections values (?, ?) on conflict do nothing')
market.get('/offers/:id', c => {
  const id = c.req.param('id')
  const row = liveOffer.get(id,promoDay())
  if (!row) return c.json({message:'Предложение недоступно'},404)
  return c.json({...JSON.parse(String(row.card)) as MarketOffer,selectionCount:Number(countSelections.get(id)!.total)})
})
market.post('/offers/:id/exposure',bodyLimit({maxSize:256,onError:c=>c.json({message:'Слишком длинный запрос'},413)}),async c=>{
  if(c.req.header('Content-Type')?.split(';')[0]!=='application/json')return c.json({message:'Ожидается JSON'},415)
  const body=await c.req.json().catch(()=>null)
  if(typeof body?.exposureId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.exposureId)
    || body.placement!=='market' || typeof body.clicked!=='boolean')return c.json({message:'Некорректный показ'},400)
  // A quick activation may arrive before the visibility event. Both use the same exposure ID.
  const result=db.prepare(`insert into market_exposures(submission_id,exposure_id,placement,seen_at,clicked)
    select p.submission_id,?,?,?,? from market_publications p join market_measured_offers m on m.id=p.submission_id
    where p.public_id=? and m.last_live is null and ${live}
    on conflict(submission_id,exposure_id) do update set clicked=max(clicked,excluded.clicked)
    where placement=excluded.placement`).run(body.exposureId.toLowerCase(),body.placement,Date.now(),+body.clicked,c.req.param('id'),promoDay())
  return result.changes ? c.json({ok:true}) : c.json({message:'Размещение недоступно'},404)
})
market.post('/offers/:id/actions', bodyLimit({maxSize:256,onError:c=>c.json({message:'Слишком длинный запрос'},413)}), async c => {
  if (c.req.header('Content-Type')?.split(';')[0] !== 'application/json') return c.json({message:'Ожидается JSON'},415)
  const event = await c.req.json().catch(()=>null)
  if (!event || typeof event.eventId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId)
      || !['open','reveal','site','route'].includes(event.kind)) return c.json({message:'Некорректное событие'},400)
  const id=c.req.param('id')
  if (!liveOffer.get(id,promoDay())) return c.json({message:'Предложение недоступно'},404)
  db.prepare(`insert or ignore into market_actions select m.id,?,?,? from market_publications p
    join market_measured_offers m on m.id=p.submission_id where p.public_id=? and m.last_live is null`)
    .run(event.eventId.toLowerCase(),event.kind,Date.now(),id)
  return c.json({ok:true})
})
market.post('/offers/:id/selection', bodyLimit({maxSize:256,onError:c=>c.json({message:'Слишком длинный запрос'},413)}), async c => {
  if (c.req.header('Content-Type')?.split(';')[0] !== 'application/json') return c.json({message:'Ожидается JSON'},415)
  const body = await c.req.json().catch(()=>null)
  const key = body?.selectionKey
  if (typeof key !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(key))
    return c.json({message:'Некорректный ключ выбора'},400)
  const id = c.req.param('id')
  if (!liveOffer.get(id,promoDay())) return c.json({message:'Предложение недоступно'},404)
  selectOnce.run(id,key.toLowerCase())
  return c.json({selectionCount:Number(countSelections.get(id)!.total)})
})
market.get('/offers/:id/:asset', c => {
  const asset = c.req.param('asset')
  if (asset !== 'image' && asset !== 'logo') return c.notFound()
  const row = db.prepare(`select json_extract(s.data,?) asset from market_publications p join v4_submissions s on s.id=p.submission_id where public_id=? and ${live}`)
    .get(asset === 'image' ? '$.offerImage' : '$.logoImage',c.req.param('id'),promoDay())
  if (!row?.asset) return c.notFound()
  const file = JSON.parse(String(row.asset)) as NonNullable<IntakeData['offerImage']>
  if (!['image/webp','image/png','image/jpeg','image/avif'].includes(file.type)) return c.notFound()
  return c.body(Buffer.from(file.base64,'base64'),200,{'Content-Type':file.type,'Content-Security-Policy':"default-src 'none'; sandbox"})
})

market.post('/search', bodyLimit({maxSize:4096,onError:c=>c.json({message:'Слишком длинный запрос'},413)}), async c => {
  if (c.req.header('Content-Type')?.split(';')[0] !== 'application/json') return c.json({message:'Ожидается JSON'},415)
  const body = await c.req.json().catch(()=>null)
  if (typeof body?.query !== 'string' || !body.query.trim() || body.query.length > 500) return c.json({message:'Введите вопрос до 500 символов'},400)
  const offset=body.offset ?? 0
  if (!Number.isSafeInteger(offset) || offset<0) return c.json({message:'Некорректная страница'},400)
  return c.json(searchMarket(body.query,offset))
})
