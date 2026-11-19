import { randomUUID } from 'node:crypto'
import { bodyLimit } from 'hono/body-limit'
import { ask, type Ask } from './ask.ts'
import { Hono } from 'hono'
import { db } from './db.ts'
import { designs, promoDay, type Receipt } from '../shared/mvp-promo.ts'
import { normalizeBusinessWebsite, offerTheme } from '../shared/campaign-business.ts'
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
)`)

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
const withdrawal = db.prepare('select 1 from market_withdrawals where submission_id=?')
export function readPartnerCampaign(id:string, until:string): Pick<Receipt,'status'|'publicId'> {
  const {status,publicId} = readReview(id)
  if (until && until < promoDay()) return {status:'expired',publicId:null}
  if (status !== 'published' && status !== 'expired' && withdrawal.get(id)) return {status:'stopped',publicId:null}
  return {status,publicId}
}

export function updateReview(id: string, employee: string, value: unknown) {
  const request = value as Partial<Review> | null
  if (!request || typeof request.reviewed !== 'boolean' || typeof request.paid !== 'boolean'
    || typeof request.erid !== 'string' || !/^(?:[A-Za-z0-9]{1,100})?$/.test(request.erid)
    || !Number.isSafeInteger(request.version) || request.version! < 0) return {error:'Проверьте отметки и erid',status:400 as const}

  db.exec('begin immediate')
  try {
    const row = db.prepare('select data from v4_submissions where id=?').get(id)
    if (!row) { db.exec('rollback'); return {error:'Заявка не найдена',status:404 as const} }
    const old = readReview(id)
    const {reviewed, paid, erid, version} = request
    if (old.reviewed === reviewed && old.paid === paid && old.erid === erid) {
      db.exec('commit')
      return {review:old, changed:false}
    }
    if (version !== old.version) { db.exec('rollback'); return {error:'Другой сотрудник изменил заявку. Обновите её и проверьте отметки',status:409 as const} }
    const data = JSON.parse(String(row.data)) as IntakeData
    const active = reviewed && paid && erid !== ''
    if (active && (!data.offerAccepted || (data.offer.until && data.offer.until < promoDay()))) {
      db.exec('rollback')
      return {error:'Для публикации нужны действующее предложение и принятая оферта',status:422 as const}
    }
    const prior = select.get(id) as Row | undefined
    if (prior?.published_at != null && !active) db.prepare('insert or ignore into market_withdrawals values (?)').run(id)
    const publicId = prior?.public_id ?? randomUUID()
    const design = designs.find(d => d.file === data.mvp?.design)
    const theme = offerTheme(data.business.category)
    const { title, promo, discount, until, tone, background, gift, zoom, layout } = data.offer
    const offer = { title, promo, discount, until, tone, background, gift, zoom, layout }
    const card: MarketOffer = { id:publicId, name:data.business.name, offer, erid, category:data.business.category, group:theme.title ? theme.cat : 'other',
      online:data.online, addresses:data.online ? [] : data.addresses.filter(Boolean), website:normalizeBusinessWebsite(data.business.website),
      image:data.offerImage ? '/api/market/offers/' + publicId + '/image' : design ? '/img/offer-variants/' + design.file : '',
      logo:data.logoImage ? '/api/market/offers/' + publicId + '/logo' : '' }
    const now = Date.now()
    db.prepare(`insert into market_publications values (?,?,?,?,?,?,?,?,?,?,?)
      on conflict(submission_id) do update set reviewed=excluded.reviewed,paid=excluded.paid,erid=excluded.erid,version=excluded.version,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at,published_at=excluded.published_at,until_day=excluded.until_day,card=excluded.card`)
      .run(id,publicId,+reviewed,+paid,erid,old.version+1,employee,now,active ? prior?.published_at ?? now : null,data.offer.until || '',active ? JSON.stringify(card) : null)
    const review = readReview(id)
    db.exec('commit')
    return {review, changed:true}
  } catch (error) { db.exec('rollback'); throw error }
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
  const rows = db.prepare(`select card from market_publications where ${live} and (?='' or json_extract(card,'$.group')=?) order by published_at desc,public_id limit 49 offset ?`).all(promoDay(),category,category,offset)
  return c.json({items:rows.slice(0,48).map(r=>JSON.parse(String(r.card)) as MarketOffer),more:rows.length>48})
})
market.get('/offers/:id', c => {
  const row = db.prepare(`select card from market_publications where public_id=? and ${live}`).get(c.req.param('id'),promoDay())
  return row ? c.json(JSON.parse(String(row.card)) as MarketOffer) : c.json({message:'Предложение недоступно'},404)
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

db.function('market_fold', {deterministic:true}, value => String(value ?? '').toLowerCase())
let recentSearches: number[] = []
market.post('/search', bodyLimit({maxSize:4096,onError:c=>c.json({message:'Слишком длинный запрос'},413)}), async c => {
  if (c.req.header('Content-Type')?.split(';')[0] !== 'application/json') return c.json({message:'Ожидается JSON'},415)
  const body = await c.req.json().catch(()=>null)
  if (typeof body?.query !== 'string' || !body.query.trim() || body.query.length > 500) return c.json({message:'Введите вопрос до 500 символов'},400)
  const query: string = body.query.trim()
  const now = Date.now()
  recentSearches = recentSearches.filter(t => t > now - 60_000)
  if (recentSearches.length >= 60) return c.json({message:'Слишком много запросов. Попробуйте через минуту'},429)
  recentSearches.push(now)
  const words = [...new Set(query.toLowerCase().match(/[а-яёa-z0-9]{3,}/g))].slice(0,8).map(w=>w.slice(0,5))
  const score = words.map(() => "(instr(market_fold(json_extract(card,'$.name')||' '||json_extract(card,'$.offer.title')||' '||json_extract(card,'$.category')||' '||json_extract(card,'$.addresses')),?)>0)").join('+') || '0.0'
  const rows = db.prepare(`select card from market_publications where ${live} order by (${score}) desc,published_at desc limit 60`).all(promoDay(),...words)
  const items = rows.map(r=>JSON.parse(String(r.card)) as MarketOffer)
  if (!items.length) return c.json({reply:'На витрине пока нет действующих предложений.',items:[]})
  const request: Ask = {turns:[{role:'user',text:query}],context:{district:'не указан',signals:[],viewed:[]},offers:items.map(o=>({
    id:o.id,partner:o.name,title:o.offer.title,small:[o.category,...o.addresses].join(' · '),cat:o.group,type:o.offer.promo ? 'promo' : 'click',dist:0,till:o.offer.until,bee:false,
  }))}
  const selected = await ask(request)
  // Recheck visibility after the asynchronous provider call.
  const current = db.prepare(`select card from market_publications where public_id=? and ${live}`)
  const hits = selected.offerIds.flatMap(id => {
    const row = current.get(id,promoDay())
    return row ? [JSON.parse(String(row.card)) as MarketOffer] : []
  })
  return c.json({reply:selected.source === 'ai' ? selected.reply : hits.length ? 'Предложения из каталога' : 'Подходящих предложений пока нет.',items:hits})
})
