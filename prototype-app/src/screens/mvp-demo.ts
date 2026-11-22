import { innError, normalizeBusinessWebsite, offerTheme } from '../../shared/campaign-business'
import { audienceGroups } from '../../shared/campaign-draft'
import { emptyOffer } from '../../shared/campaign-offer'
import { designs, promoDay, validPromo, type MvpSession, type Profile, type Receipt } from '../../shared/mvp-promo'
import type { Review, MarketOffer } from '../../shared/market'
import { v4StaffPageSize, type V4Submission } from '../../shared/v4-staff'
import { queryClient } from '../api'
import { applyCatalogPatch, catalogFields, catalogPatch, validCatalogFields, type CatalogRecord } from '../../shared/market-catalog'
import { demoRank, keyboardWords, searchColumns, searchReply, searchWords, spellingWord } from '../../shared/market-search'
import { beelineOffers } from '../../shared/beeline-benefits'

// This test host keeps both roles and the showcase in this browser.
export const partnerDemo = typeof location !== 'undefined' && location.hostname === 'ad.napovtor.ru'
export const demoEmail = 'partner@example.test'
export const demoStaffEmail = 'staff@example.test'
export const demoCode = '123456'
export const demoCompany = {
  inn:'7707083893', name:'Кофейня на Садовой', registeredAddress:'Москва, ул. Садовая, 12',
  category:'Кофейня', website:'https://coffee.example.test',
}
const prefix = 'beepartners-partner-demo-v1/'
const receiptPrefix = prefix+'receipt/'
if (partnerDemo) window.addEventListener('storage',event=>{
  if (event.key?.startsWith(receiptPrefix) || event.key?.startsWith(prefix+'offer-edit/')) {
    for (const key of ['mvp-campaigns','mvp-receipt','v4-staff','market','market-detail','market-search'])
      void queryClient.invalidateQueries({queryKey:[key]})
  }
})
type DemoReceipt = Receipt & {review?:Review; marketId?:string}
const emptyReview:Review = {reviewed:false,paid:false,erid:'',version:0,status:'review',publicId:null}
function prepareDemoCampaigns() {
  const samples = [
    ['ПРИМЕР10','На десерт к кофе','review'],
    ['ПРИМЕР15','На утренний кофе','published'],
    ['ПРИМЕР20','На сезонный напиток','stopped'],
  ] as const
  for (const [i,[code,cond,status]] of samples.entries()) {
    const id='b216398e-7075-52eb-b79a-9c0ded4fc00'+i
    if (localStorage.getItem(receiptPrefix+id)) continue
    const marketId=status==='review' ? undefined : '8c415640-ad04-5177-814b-c4543efac00'+i
    const publicId=status==='published' ? marketId! : null
    const r:DemoReceipt={id,marketId,status,publicId,submittedAt:Date.now()-(i+1)*86_400_000,
      profile:{inn:demoCompany.inn,company:demoCompany.name,addr:demoCompany.registeredAddress,category:demoCompany.category},
      promo:{code,cond,off:code.slice(-2),site:demoCompany.website,till:promoDay(30),design:'plain',
        online:false,addresses:[demoCompany.registeredAddress],mode:'auto',check:'850',fee:'8',via:'постбэк'},
      review:status==='review' ? emptyReview : {reviewed:true,paid:!!publicId,erid:'DemoCoffee'+i,version:1,
        status:publicId ? 'published' : 'awaiting_payment',publicId}}
    try { localStorage.setItem(receiptPrefix+id,JSON.stringify(r)) }
    catch { return } // Existing campaigns still open when storage is full.
  }
}
function readReceipt(id:string):DemoReceipt {
  const stored = localStorage.getItem(receiptPrefix+id)
  if (!stored) throw new Error('Тестовая кампания не найдена в этом браузере')
  const r:DemoReceipt = JSON.parse(stored)
  if (r.promo.till < promoDay()) {
    r.status='expired'; r.publicId=null
    if (r.review?.status==='published') r.review={...r.review,status:'expired',publicId:null}
  }
  return r
}
function allReceipts() {
  prepareDemoCampaigns()
  return Object.keys(localStorage).filter(k=>k.startsWith(receiptPrefix))
    .map(k=>readReceipt(k.slice(receiptPrefix.length))).sort((a,b)=>b.submittedAt-a.submittedAt || b.id.localeCompare(a.id))
}

export function mockPartnerRequest(path:string, body?:object):unknown {
  const input = (body ?? {}) as Record<string,unknown>
  if (path === '/code') {
    if (input.email !== demoEmail && input.email !== demoStaffEmail) throw new Error('Выберите тестовый аккаунт')
    const challenge = crypto.randomUUID()
    sessionStorage.setItem(prefix+'challenge',input.email+'/'+challenge)
    return {challenge}
  }
  if (path === '/verify') {
    const stored=sessionStorage.getItem(prefix+'challenge')
    const matches=stored === input.email+'/'+input.challenge || (input.email === demoEmail && stored === input.challenge)
    if (!input.challenge || (input.email !== demoEmail && input.email !== demoStaffEmail) || !matches || input.code !== demoCode)
      throw new Error('Введите тестовый код '+demoCode)
    sessionStorage.removeItem(prefix+'challenge')
    sessionStorage.setItem(prefix+'signed-in',input.email === demoStaffEmail ? 'staff' : 'yes')
    return {status:'verified'}
  }

  const identity = sessionStorage.getItem(prefix+'signed-in')
  const profile = JSON.parse(localStorage.getItem(prefix+'company') ?? 'null') as Profile | null
  const session: MvpSession = {email:demoEmail,profile}
  if (path === '/session') return identity === 'staff' ? {email:demoStaffEmail,role:'staff',profile:null} : identity === 'yes' ? session : null
  if (path === '/logout') {
    sessionStorage.removeItem(prefix+'signed-in')
    return {status:'signed-out'}
  }
  if (identity !== 'yes') throw new Error('Откройте демо-вход партнёра')
  if (path === '/company') {
    const company = input as Partial<Profile>
    if (typeof company.inn !== 'string' || innError(company.inn) || !company.company?.trim()) throw new Error('Проверьте данные компании')
    localStorage.setItem(prefix+'company',JSON.stringify(company))
    return {...session,profile:company}
  }
  if (path === '/offer-ai' && profile) {
    const condition = (input.offer as {title:string}).title.trim()
    const text = 'Скидка '+(input.offer as {discount:string}).discount+'% '+(condition || 'по промокоду')
    const title = text.length <= 60 ? text : condition
    return {source:'demo',answer:{status:'draft',patch:{title},options:[],question:null,visual:{action:'keep',assetId:null,prompt:null},logoAssetId:null}}
  }
  if (path === '/campaigns' && body) {
    if (!profile || input.inn !== profile.inn || input.accepted !== true || typeof input.key !== 'string' || !validPromo(input.promo))
      throw new Error('Проверьте условия кампании')
    const id = input.key
    if (localStorage.getItem(receiptPrefix+id)) return {id,created:false}
    const receipt:Receipt = {id,profile,promo:input.promo,status:'review',publicId:null,submittedAt:Date.now()}
    try { localStorage.setItem(receiptPrefix+id,JSON.stringify(receipt)) }
    catch { throw new Error('Недостаточно места в браузере для тестовой кампании. Попробуйте фото меньшего размера.') }
    return {id,created:true}
  }
  if (path.startsWith('/campaigns/')) {
    return readReceipt(path.slice('/campaigns/'.length))
  }
  if (path.split('?')[0] === '/campaigns') {
    const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset') ?? 0)
    const items = allReceipts().map(r=>({id:r.id,code:r.promo.code,company:r.profile.company,submittedAt:r.submittedAt,status:r.status}))
    return {items:items.slice(offset,offset+25),more:items.length>offset+25}
  }
  throw new Error('Этот экран недоступен в демо партнёра')
}

function demoOffer({promo:p}:Receipt) {
  return {...emptyOffer,title:p.cond || 'Скидка по промокоду',promo:p.code,discount:p.off,until:p.till,tone:designs.find(d=>d.file===p.design)?.tone ?? emptyOffer.tone}
}

export async function mockStaffRequest(path:string,body?:object) {
  if (sessionStorage.getItem(prefix+'signed-in') !== 'staff') throw new Error('Войдите как тестовый сотрудник')
  const url=new URL(path,location.origin)
  if (url.pathname==='/offers') {
    const q=(url.searchParams.get('q') ?? '').trim().toLowerCase(), offset=Number(url.searchParams.get('offset') ?? 0)
    const status=url.searchParams.get('status')
    const list=demoCatalog().map(row=>row.record).filter(r=>(!status || r.status===status) &&
      [r.fields.brand,r.fields.benefit,r.key].some(v=>v.toLowerCase().includes(q)))
    return {total:list.length,items:list.slice(offset,offset+40)}
  }
  if (url.pathname.startsWith('/offers/')) {
    const key=url.pathname.slice(8)
    const locate=()=>{const row=demoCatalog().find(r=>r.record.key===key);if(!row)throw new Error('Предложение не найдено');return row}
    if (!body) return locate().record
    return navigator.locks.request(prefix+'offer-edit/'+key,()=>{
      const row=locate(), draft=body as {version:number;fields:unknown}
      if (draft.version!==row.record.version) throw new Error('Предложение изменилось. Обновите форму перед сохранением.')
      if (!validCatalogFields(draft.fields)) throw new Error('Проверьте поля предложения')
      localStorage.setItem(prefix+'offer-edit/'+key,JSON.stringify({version:draft.version+1,patch:catalogPatch(row.base,draft.fields)}))
      return locate().record
    })
  }
  if (path === '/submissions/search') {
    const {query='',page=1} = (body ?? {}) as {query?:string;page?:number}
    const rows = allReceipts().filter(r=>[r.profile.company,r.profile.inn,demoEmail].some(s=>s.toLowerCase().includes(query.toLowerCase())))
    const offset = (Math.max(1,Math.min(page,Math.ceil(rows.length/v4StaffPageSize)))-1)*v4StaffPageSize
    return {total:rows.length,items:rows.slice(offset,offset+v4StaffPageSize).map(r=>({id:r.id,submittedAt:r.submittedAt,
      name:r.profile.company,inn:r.profile.inn,city:r.promo.city ?? '',email:demoEmail,phone:null,contactName:null,title:demoOffer(r).title,status:r.status}))}
  }
  const match = /^\/submissions\/([\w-]+)(\/review)?$/.exec(path)
  if (!match) throw new Error('Раздел недоступен в демо сотрудника')
  const id = match[1]
  if (match[2]) return navigator.locks.request(receiptPrefix+id,()=>{
    const r=readReceipt(id), old=r.review ?? emptyReview
    const {version,reviewed,paid,erid}=(body ?? {}) as Partial<Review>
    if (typeof reviewed !== 'boolean' || typeof paid !== 'boolean' || typeof erid !== 'string' || !/^[A-Za-z0-9]{0,100}$/.test(erid)) throw new Error('Проверьте отметки и erid')
    if (old.reviewed===reviewed && old.paid===paid && old.erid===erid) return {review:old,changed:false}
    if (version !== old.version) throw new Error('Заявка изменилась. Обновите её перед сохранением')
    const active=reviewed && paid && !!erid
    if (active && r.status==='expired') throw new Error('Срок действия предложения закончился')
    const marketId=r.marketId ?? (active ? crypto.randomUUID() : undefined)
    const status=active ? 'published' : reviewed && erid && !paid ? 'awaiting_payment' : 'review'
    const review:Review={version:old.version+1,reviewed,paid,erid,status,publicId:active ? marketId! : null}
    localStorage.setItem(receiptPrefix+id,JSON.stringify({...r,marketId,review,publicId:review.publicId,status:!active && marketId ? 'stopped' : status}))
    return {review,changed:true}
  })
  const r=readReceipt(id), p=r.promo, company=r.profile
  return {id,status:r.status,submittedAt:r.submittedAt,review:r.review ?? emptyReview,mvp:p,mvpProfile:company,email:demoEmail,
    business:{name:company.company,inn:company.inn,category:company.category ?? '',website:p.site,city:p.city ?? '',phone:''},
    addresses:p.addresses ?? [],online:!!p.online,offer:demoOffer(r),offerAccepted:true,offerImage:p.photo?.name ?? null,logoImage:null,
    audience:[p.area,p.gender,p.age,p.income,p.moment].map((v,i)=>Math.max(0,audienceGroups[i].choices.indexOf(v ?? ''))),
    audienceCity:p.city,triggers:p.wishes ?? ''} satisfies V4Submission
}

function demoCatalog() {
  function entry(base:MarketOffer,key:string,origin:CatalogRecord['origin'],status:CatalogRecord['status']) {
    const edit=JSON.parse(localStorage.getItem(prefix+'offer-edit/'+key) ?? '{}')
    const card=applyCatalogPatch(base,edit.patch ?? {})
    const record:CatalogRecord={key,origin,status,publicId:status==='published' ? card.id : null,fields:catalogFields(card),version:edit.version ?? 0}
    return {base,card,record}
  }
  const partners=allReceipts().map(r=>{
    const category=r.profile.category ?? '', theme=offerTheme(category), p=r.promo
    const design=designs.find(d=>d.file===p.design)
    const base:MarketOffer={id:r.marketId ?? r.publicId ?? r.id,name:r.profile.company,offer:demoOffer(r),erid:r.review?.erid ?? '',category,
      group:theme.title ? theme.cat : 'other',online:!!p.online,addresses:p.addresses ?? [],website:normalizeBusinessWebsite(p.site),logo:'',
      image:p.photo && p.usePhoto!==false ? p.photo.src : design ? '/img/offer-variants/'+design.file : ''}
    return entry(base,r.id,'partner',r.status==='expired' ? 'expired' : r.status==='published' && !!r.publicId ? 'published' : 'unpublished')
  })
  return partners.concat(beelineOffers.map(card=>entry(card,card.id,'beeline',card.offer.until && card.offer.until<promoDay() ? 'expired' : 'published')))
}

export function mockMarketRequest(path:string,body?:object) {
  const url=new URL(path,location.origin)
  const offers=demoCatalog().filter(row=>row.record.status==='published').map(row=>row.card)
  if (url.pathname==='/offers') {
    const category=url.searchParams.get('category'), offset=Number(url.searchParams.get('offset') ?? 0)
    const items=offers.filter(o=>!category || o.group===category)
    const categories: Record<string,number> = {}
    for (const offer of offers) categories[offer.group] = (categories[offer.group] ?? 0) + 1
    return {items:items.slice(offset,offset+48),more:items.length>offset+48,categories}
  }
  if (url.pathname==='/search') {
    const {query,offset=0}=body as {query:string;offset?:number}
    const words=searchWords(query)
    const rank=(tokens:string[])=>offers.map(card=>({card,score:demoRank(card,tokens)})).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score || a.card.id.localeCompare(b.card.id))
    let hits=rank(words)
    const exact=hits.length>0
    if (!exact && words.length) {
      hits=rank(keyboardWords(query))
      if (!hits.length) {
        const columns=offers.map(searchColumns)
        const vocabulary=new Set(columns.flatMap(c=>c.slice(0,3).join(' ').split(' ')))
        const all=new Set(columns.flatMap(c=>c.join(' ').split(' ')))
        const corrected=words.map(w=>Array.from(all).some(t=>t.startsWith(w)) ? w : spellingWord(w,vocabulary))
        hits=rank(corrected)
      }
    }
    return {items:hits.slice(offset,offset+48).map(hit=>hit.card),total:hits.length,more:hits.length>offset+48,
      reply:(!exact && hits.length ? 'По близкому написанию. ' : '')+searchReply(hits.length)}
  }
  const offer=offers.find(o=>url.pathname==='/offers/'+o.id)
  if (!offer) throw new Error('Предложение больше недоступно')
  return offer
}
