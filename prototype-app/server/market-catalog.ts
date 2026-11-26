import { db } from './db.ts'
import { beelineOffers } from '../shared/beeline-benefits.ts'
import { catalogFields, catalogPatch, validCatalogFields, type CatalogRecord } from '../shared/market-catalog.ts'
import { keyboardWords, searchColumns, searchReply, searchWords, spellingWord } from '../shared/market-search.ts'
import { promoDay } from '../shared/mvp-promo.ts'
import { offerTheme } from '../shared/campaign-business.ts'
import type { MarketOffer } from '../shared/market.ts'

export function initializeMarketCatalog() {
  db.exec('begin immediate')
  try {
    db.exec(`create table if not exists market_imports (
      public_id text primary key, published_at integer, until_day text not null, card text not null);
    create table if not exists market_edits (
      entry_key text primary key, patch text not null, version integer not null, updated_by text not null, updated_at integer not null);
    create table if not exists market_search_keys (id integer primary key, entry_key text not null unique);
    create table if not exists market_search_queue (entry_key text primary key);
    create virtual table if not exists market_fts using fts5(brand,headline,category,description,place,terms, tokenize='unicode61', prefix='2 3 4');
    create virtual table temp.market_vocab using fts5vocab(main,market_fts,'col');
    create temp view market_base as
      select public_id entry_key, public_id, published_at, until_day, card from market_imports
      union all select submission_id, public_id, published_at, until_day, card from market_publications;
    create temp view market_catalogue as
      select b.entry_key,b.public_id,b.published_at,b.until_day,
        case when e.patch is null then b.card else json_patch(b.card,e.patch) end card
      from market_base b left join market_edits e on e.entry_key=b.entry_key;`)
    for (const [table,key] of [['market_imports','public_id'],['market_publications','submission_id'],['market_edits','entry_key']]) {
      for (const action of ['insert','update','delete']) {
        const row=action==='delete' ? 'old' : 'new'
        db.exec(`create trigger if not exists ${table}_search_${action} after ${action} on ${table}
          begin insert into market_search_queue values (${row}.${key}) on conflict do nothing; end`)
      }
    }
    const seed=db.prepare(`insert into market_imports values(?,?,?,?) on conflict(public_id) do update set
      published_at=excluded.published_at,until_day=excluded.until_day,card=excluded.card
      where market_imports.card<>excluded.card or market_imports.published_at is not excluded.published_at`)
    for (const card of beelineOffers) seed.run(card.id,Date.parse(card.source!.fetchedAt),card.offer.until,JSON.stringify(card))
    db.prepare(`update market_imports set published_at=null where published_at is not null and public_id not in (select value from json_each(?))`).run(JSON.stringify(beelineOffers.map(o=>o.id)))
    db.exec(`insert or ignore into market_search_queue select entry_key from market_base
      where card is not null and entry_key not in (select entry_key from market_search_keys)`)
    // Unreviewed submissions already belong to the staff register. Only approved snapshots enter the public view.
    db.function('market_group', {deterministic:true}, raw=>{const t=offerTheme(String(raw ?? ''));return t.title ? t.cat : 'other'})
    db.exec(`create temp view staff_market_base as
      select public_id entry_key, 'beeline' origin, public_id,published_at,until_day,card from market_imports
      union all select s.id,'partner',p.public_id,p.published_at,coalesce(p.until_day,json_extract(s.data,'$.offer.until'),''),
        coalesce(p.card,json_object('name',coalesce(nullif(c.company,''),json_extract(s.data,'$.business.name')),'offer',json_extract(s.data,'$.offer'),
          'catalog',json_object('brand',nullif(trim(json_extract(s.data,'$.mvp.brandName')),'')),'description',json_extract(s.data,'$.mvp.activity'),
          'group',market_group(json_extract(s.data,'$.business.category')), 'category',json_extract(s.data,'$.business.category'),
          'online',json_extract(s.data,'$.online'),'addresses',coalesce(json_extract(s.data,'$.addresses'),json('[]'))))
      from v4_submissions s left join market_publications p on p.submission_id=s.id left join campaign_contracts c on c.submission_id=s.id;
    create temp view staff_market_catalogue as select b.*,coalesce(e.version,0) version,
      case when e.patch is null then b.card else json_patch(b.card,e.patch) end effective
      from staff_market_base b left join market_edits e on e.entry_key=b.entry_key;`)
    db.function('market_fold',{deterministic:true},raw=>String(raw ?? '').toLowerCase().replaceAll('ё','е'))
    db.exec('commit')
  } catch (err) { db.exec('rollback'); throw err }
}

function refreshSearchIndex() {
  if (!db.prepare('select 1 from market_search_queue limit 1').get()) return
  db.exec('begin immediate')
  try {
    const lookup=db.prepare('select card from market_catalogue where entry_key=? and published_at is not null')
    const keyId=db.prepare('select id from market_search_keys where entry_key=?')
    const remember=db.prepare('insert or ignore into market_search_keys(entry_key) values(?)')
    const remove=db.prepare('delete from market_fts where rowid=?')
    const index=db.prepare('insert into market_fts(rowid,brand,headline,category,description,place,terms) values(?,?,?,?,?,?,?)')
    for (const {entry_key} of db.prepare('select entry_key from market_search_queue').all()) {
      remember.run(entry_key)
      const {id}=keyId.get(entry_key)!
      remove.run(id)
      const row=lookup.get(entry_key)
      if (row?.card) index.run(id,...searchColumns(JSON.parse(String(row.card))))
    }
    db.exec('delete from market_search_queue; commit')
  } catch (err) { db.exec('rollback'); throw err }
}

export function searchMarket(query:string,offset:number) {
  const words=searchWords(query)
  if (!words.length) return {reply:searchReply(0),items:[],more:false,total:0}
  refreshSearchIndex()
  const expression=(tokens:string[])=>tokens.map(w=>'"'+w+'"'+(/^\d+$/.test(w) ? '' : '*')).join(' AND ')
  const from=`from market_fts join market_search_keys k on k.id=market_fts.rowid join market_catalogue c on c.entry_key=k.entry_key
    where market_fts match ? and c.published_at is not null and (c.until_day='' or c.until_day>=?)`
  const day=promoDay()
  const count=db.prepare('select count(*) n '+from)
  let expr=expression(words), total=Number(count.get(expr,day)!.n)
  if (!total) {
    const layout=expression(keyboardWords(query))
    if (layout && layout!==expr && (total=Number(count.get(layout,day)!.n))) expr=layout
  }
  if (!total) {
    const known=db.prepare('select 1 from market_vocab where term>=? and term<? limit 1')
    const vocab=db.prepare("select term from market_vocab where term>=? and term<? and col in ('brand','headline','category') order by doc desc,term limit 500")
    const corrected=words.map(w=>{
      if (w.length<4 || known.get(w,w+'\uffff')) return w
      return spellingWord(w,vocab.all(w[0],w[0]+'\uffff').map(r=>String(r.term)))
    })
    const retry=expression(corrected)
    if (retry!==expr) {expr=retry;total=Number(count.get(expr,day)!.n)}
  }
  const rows=db.prepare('select c.card '+from+' order by bm25(market_fts,16,9,5,3,3,1),c.public_id limit 48 offset ?').all(expr,day,offset)
  return {reply:(total && expr!==expression(words) ? 'По близкому написанию. ' : '')+searchReply(total),items:rows.map(r=>JSON.parse(String(r.card)) as MarketOffer),more:offset+rows.length<total,total}
}

type RegistryRow = {entry_key:string; origin:CatalogRecord['origin']; public_id:string|null; published_at:number|null; until_day:string; card:string; effective:string; version:number}
function record(row:RegistryRow):CatalogRecord {
  const status=row.until_day && row.until_day<promoDay() ? 'expired' : row.published_at===null ? 'unpublished' : 'published'
  return {key:row.entry_key, origin:row.origin, status,version:row.version, publicId:status==='published' ? row.public_id : null,
    fields:catalogFields(JSON.parse(row.effective))}
}
export function staffCatalog(query:string,offset:number,status='') {
  const where=`where (?='' or (case when until_day<>'' and until_day<? then 'expired' when published_at is null then 'unpublished' else 'published' end)=?) and (?='' or instr(market_fold(coalesce(json_extract(effective,'$.catalog.brand'),'')||' '||coalesce(json_extract(effective,'$.name'),'')||' '||
    coalesce(json_extract(effective,'$.catalog.benefit'),'')||' '||coalesce(json_extract(effective,'$.offer.title'),'')||' '||entry_key||' '||coalesce(public_id,'')),market_fold(?))>0)`
  const args=[status,promoDay(),status,query,query]
  const total=Number(db.prepare('select count(*) n from staff_market_catalogue '+where).get(...args)!.n)
  const items=(db.prepare('select * from staff_market_catalogue '+where+' order by published_at desc,entry_key limit 40 offset ?')
    .all(...args,offset) as RegistryRow[]).map(record)
  return {items,total}
}
export function staffCatalogRecord(key:string) {
  const row=db.prepare('select * from staff_market_catalogue where entry_key=?').get(key) as RegistryRow|undefined
  return row && record(row)
}
export function editMarket(key:string,employee:string,body:{version?:number;fields?:unknown}|null) {
  if (!Number.isSafeInteger(body?.version) || !validCatalogFields(body?.fields)) return {error:'Проверьте поля предложения',status:400 as const}
  db.exec('begin immediate')
  try {
    const row=db.prepare('select * from staff_market_catalogue where entry_key=?').get(key) as RegistryRow|undefined
    if (!row) {db.exec('rollback');return {error:'Предложение не найдено',status:404 as const}}
    if (row.version!==body?.version) {db.exec('rollback');return {error:'Предложение изменилось. Обновите форму перед сохранением.',status:409 as const}}
    const patch=catalogPatch(JSON.parse(row.card),body.fields)
    db.prepare(`insert into market_edits values(?,?,?,?,?) on conflict(entry_key) do update set
      patch=excluded.patch,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .run(key,JSON.stringify(patch),row.version+1,employee,Date.now())
    const saved=staffCatalogRecord(key)!
    db.exec('commit')
    return {saved}
  } catch (err) {db.exec('rollback');throw err}
}
