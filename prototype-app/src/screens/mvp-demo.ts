import { validPartnerDraft } from '../../shared/partner-campaign-draft'
import {demoContract,demoContracts,storeDemoContract,prepareDemoContract} from './demo-contract'
import type { Notifications } from './CampaignNotifications'
import { campaignLabels, dashboardSearchParams, dashboardFilter, dashboardPageSize, moscowDay, periodStart, reportPeriod, type MarketAction, type MarketResponseReport, type DashboardOverview, type DashboardGroup, type DashboardRow } from '../../shared/cabinet-dashboard'
import { districtOffers, inRadius, intentMatches, questionBudget, withinBudget } from './market-nearby'
import { innError } from '../../shared/campaign-business'
import { audienceGroups } from '../../shared/campaign-draft'
import { posterSource } from '../../shared/partner-poster'
import { promoMarketCard, promoOffer } from '../../shared/campaign-market'
import { designs, promoDay, validPromo, type PartnerCampaignStatus, type MvpSession, type Profile, type Receipt } from '../../shared/mvp-promo'
import type { Review, MarketOffer } from '../../shared/market'
import { v4StaffPageSize, type V4Submission } from '../../shared/v4-staff'
import { queryClient } from '../api'
import { applyCatalogPatch, catalogFields, catalogPatch, validCatalogFields, type CatalogRecord } from '../../shared/market-catalog'
import { demoRank, keyboardWords, searchColumns, searchReply, searchWords, spellingWord } from '../../shared/market-search'
import { beelineOffers } from '../../shared/beeline-benefits'

// The demo keeps both roles in this browser, including explicit local Vite previews.
export const partnerDemo = import.meta.env.MODE === 'partner-demo' && typeof location !== 'undefined' &&
  (location.hostname === 'ad.napovtor.ru' || (import.meta.env.DEV && ['127.0.0.1','localhost'].includes(location.hostname)))
export const demoEmail = 'partner@example.test'
export const demoStaffEmail = 'staff@example.test'
export const demoCode = '123456'
export const demoCompany = {
  inn:'0000000018', name:'Кофейня на Садовой', registeredAddress:'Москва, ул. Садовая, 12',
  category:'Кофейня', website:'https://coffee.example.test',
}
const prefix = 'beepartners-partner-demo-v1/'
export function demoSiteProfile(website:string) {
  return new URL(website).hostname===new URL(demoCompany.website).hostname
    ? {subject:'Кофе и завтраки',description:'',name:demoCompany.name}
    : {subject:'',description:'',name:''}
}
const receiptPrefix = prefix+'receipt/'
if (partnerDemo) window.addEventListener('storage',event=>{
  if (event.key?.startsWith(prefix+'contract/') || event.key?.startsWith(receiptPrefix) || event.key?.startsWith(prefix+'offer-edit/')) {
    for (const key of ['mvp-contract','campaign-notifications','mvp-campaigns','mvp-receipt','v4-staff','market','market-detail','market-search'])
      void queryClient.invalidateQueries({queryKey:[key]})
  }
})
type DemoReceipt = Receipt & {review?:Review; marketId?:string;events?:Notifications['items']}
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
  if (r.status==='authorization') r.status='review'
  if (String(r.status)==='awaiting_payment')r.status='contract'
  if (String(r.status)==='expired')r.status='archived'
  if (r.promo.till && r.promo.till < promoDay()) {
    r.status='archived'; r.publicId=null
    if (r.review?.status==='published') r.review={...r.review,status:'expired',publicId:null}
  }
  r.contract=demoContract(id)
  return r
}
function allReceipts() {
  prepareDemoCampaigns()
  return Object.keys(localStorage).filter(k=>k.startsWith(receiptPrefix))
    .map(k=>readReceipt(k.slice(receiptPrefix.length))).sort((a,b)=>b.submittedAt-a.submittedAt || b.id.localeCompare(a.id))
}

function demoDashboard(path: string, body:object|undefined, staff:boolean) {
  const url = new URL(path, location.origin)
  const receipts = allReceipts()
  const rows: DashboardRow[] = receipts.map(r => ({
    kind:'campaign',publicId:r.publicId,version:r.review?.version??0,
    id:r.id, name:r.profile.company, code:r.promo.code, title:demoOffer(r).title, inn:r.profile.inn, email:demoEmail,
    city:r.promo.city ?? '', contactName:'', phone:'', submittedAt:r.submittedAt, status:r.status,
    channel:r.promo.online ? 'online' : r.promo.addresses?.some(Boolean) ? 'places' : 'unspecified',
  }))
  const pending:DashboardRow[]=demoContracts().filter(c=>!c.submissionId).map(c=>({id:c.id,name:c.company,status:'contract',kind:'contract',title:'Договор на размещение',inn:c.inn,email:c.email,submittedAt:c.createdAt,version:c.version,channel:'unspecified',contactName:'',city:'',phone:'',code:''}))
  if (url.pathname === '/dashboard') {
    const today = moscowDay(Date.now()), groups = new Map<string,DashboardGroup>()
    const funnel = new Map<string,NonNullable<DashboardOverview['funnel']>[number]>()
    const firstLogin=Number(localStorage.getItem(prefix+'authorized-at'))
    if (staff && firstLogin) funnel.set('login',{day:moscowDay(firstLogin),status:'authorization',count:1})
    for (const [index,row] of rows.entries()) {
      const day = moscowDay(row.submittedAt)
      if (day < today-365) continue
      const key = [day,row.status,row.channel].join('/')
      const group = groups.get(key) ?? {day,status:row.status,channel:row.channel,verified:0,count:0}
      const receipt = receipts[index], review = receipt.review
      if (staff) {
        const visits = new Set([row.status, ...(receipt.events??[]).flatMap(e=>[e.fromStage,e.toStage])])
        if (receipt.marketId || receipt.publicId) visits.add('published')
        visits.add('contract')
        visits.delete('authorization')
        for (const status of visits) {
          const key = day+'/'+status
          const visit = funnel.get(key) ?? {day,status,count:0}
          visit.count++
          funnel.set(key,visit)
        }
      }
      if (review?.reviewed && review.erid) group.verified++
      group.count++
      groups.set(key,group)
    }
    return {today,groups:[...groups.values()],...(staff && {funnel:[...funnel.values(),...pending.map(r=>({day:moscowDay(r.submittedAt),status:r.status,count:1}))]}),recent:rows.slice(0,5).map(({id,name,code,submittedAt})=>({id,name,code,submittedAt}))}
  }
  const {q,status,page:requested,sort,days} = dashboardFilter(dashboardSearchParams(body))
  const filtered = [...rows,...pending].sort((a,b)=>b.submittedAt-a.submittedAt).filter(r=>(!days || (r.kind==='campaign' && moscowDay(r.submittedAt)>=moscowDay(Date.now())-days+1)) && (!status || r.status===status) && [r.name,r.code,r.title,r.inn,r.email,r.contactName,r.phone].join(' ').toLowerCase().includes(q))
  if (sort==='oldest') filtered.sort((a,b)=>a.submittedAt-b.submittedAt || b.id.localeCompare(a.id))
  if (sort==='name') filtered.sort((a,b)=>a.name.localeCompare(b.name,'ru') || b.submittedAt-a.submittedAt)
  const page = Math.min(requested,Math.max(1,Math.ceil(filtered.length/dashboardPageSize)))
  return {items:filtered.slice((page-1)*dashboardPageSize,page*dashboardPageSize),total:filtered.length,page}
}

function demoResponseStart(kind='measurement-start') {
  const key=prefix+kind
  if(!localStorage.getItem(key))localStorage.setItem(key,String(Date.now()))
  return Number(localStorage.getItem(key))
}
function demoResponses(days:number):MarketResponseReport {
  const now=Date.now(), since=demoResponseStart(), impressionSince=demoResponseStart('impression-start'), start=periodStart(days,now)
  const items:MarketResponseReport['items']=[], daily=new Map<number,MarketResponseReport['daily'][number]>()
  const receipts=allReceipts(), keys=Object.keys(localStorage)
  for(const receipt of receipts) {
    if(!receipt.marketId)continue
    const counts={opens:0,reveals:0,sites:0,routes:0,marketShows:0,marketClicks:0}
    const actionPrefix=prefix+'action/'+receipt.marketId+'/', exposurePrefix=prefix+'exposure/'+receipt.marketId+'/'
    for(const key of keys) {
      if(!key.startsWith(actionPrefix) && !key.startsWith(exposurePrefix))continue
      const [time,kind,clicked]=localStorage.getItem(key)!.split('/')
      if(Number(time)<start || Number(time)>now)continue
      if(key.startsWith(exposurePrefix)){
        if(kind==='market'){
          counts.marketShows++
          if(clicked==='1')counts.marketClicks++
        }
        continue
      }
      counts[({open:'opens',reveal:'reveals',site:'sites',route:'routes'} as const)[kind as MarketAction]]++
      const day=moscowDay(Number(time)), bucket=daily.get(day)??{day,opens:0,clicks:0}
      if(kind==='open')bucket.opens++
      else bucket.clicks++
      daily.set(day,bucket)
    }
    const observed=receipt.publicId || receipt.events?.some(e=>e.fromStage==='published' && e.createdAt>=Math.max(start,since))
    if(observed || Object.values(counts).some(Boolean))items.push({id:receipt.id,title:demoOffer(receipt).title,code:receipt.promo.code,online:!!receipt.promo.online,landingShows:0,landingClicks:0,...counts})
  }
  return {since,impressionSince,today:moscowDay(now),hasCampaigns:!!receipts.length,daily:[...daily.values()],items}
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
    if (input.email===demoEmail && !localStorage.getItem(prefix+'authorized-at')) localStorage.setItem(prefix+'authorized-at',String(Date.now()))
    sessionStorage.setItem(prefix+'signed-in',input.email === demoStaffEmail ? 'staff' : 'yes')
    return {status:'verified'}
  }

  const identity = sessionStorage.getItem(prefix+'signed-in')
  const profile = JSON.parse(localStorage.getItem(prefix+'company') ?? 'null') as Profile | null
  const session: MvpSession = {email:demoEmail,profile,hasDrafts:Object.keys(localStorage).some(k=>k.startsWith(prefix+'draft/'))}
  if (path === '/session') return identity === 'staff' ? {email:demoStaffEmail,role:'staff',profile:null} : identity === 'yes' ? session : null
  if (path === '/logout') {
    sessionStorage.removeItem(prefix+'signed-in')
    return {status:'signed-out'}
  }
  if (identity !== 'yes') throw new Error('Откройте демо-вход партнёра')
  if(path==='/notifications/read'){
    localStorage.setItem(prefix+'seen-event',String(Math.max(Number(localStorage.getItem(prefix+'seen-event')),Number(input.through))))
    return {ok:true}
  }
  if(path.startsWith('/notifications?')){
    const before=Number(new URL(path,location.origin).searchParams.get('before'))
    const all=allReceipts().flatMap(r=>r.events??[]).sort((a,b)=>b.eventId-a.eventId)
    const rows=all.filter(e=>!before||e.eventId<before)
    return {items:rows.slice(0,25),more:rows.length>25,unread:all.filter(e=>e.eventId>Number(localStorage.getItem(prefix+'seen-event'))).length}
  }
  if(path==='/drafts'){
    return Object.keys(localStorage).filter(k=>k.startsWith(prefix+'draft/')).map(k=>JSON.parse(localStorage.getItem(k)!))
      .filter(d=>!d.inn || d.inn===profile?.inn).sort((a,b)=>b.updatedAt-a.updatedAt).map(d=>({id:d.id,step:d.data.step,code:d.data.promo.code,title:d.data.promo.cond,updatedAt:d.updatedAt}))
  }
  if(path.startsWith('/drafts/')){
    const id=path.slice(8), key=prefix+'draft/'+id, old=JSON.parse(localStorage.getItem(key)??'null')
    if(old?.inn && old.inn!==profile?.inn)throw new Error('Черновик недоступен для текущей компании.')
    if(!body)return old
    if(localStorage.getItem(receiptPrefix+id) || input.version!==(old?.version??0))throw Object.assign(new Error('Черновик изменился. Откройте сохранённую версию.'),{status:409})
    if(input.keepAttachment && old?.data.contractInput?.attachment)(input.data as {contractInput:{attachment:unknown}}).contractInput.attachment=old.data.contractInput.attachment
    if(!validPartnerDraft(input.data as Parameters<typeof validPartnerDraft>[0]))throw new Error('Проверьте данные черновика.')
    const next={id,data:input.data,version:(old?.version??0)+1,updatedAt:Date.now(),inn:profile?.inn}
    localStorage.setItem(key,JSON.stringify(next));return next
  }
  if(path==='/contracts/defaults')return {legalName:profile?.company,legalAddress:profile?.addr}
  if(path.startsWith('/contracts/')){
    const id=path.slice('/contracts/'.length)
    if(!body)return demoContract(id)
    if(!profile)throw new Error('Укажите компанию.')
    return prepareDemoContract(id,demoEmail,profile,input)
  }
  if (path.startsWith('/statistics/responses?'))return demoResponses(reportPeriod(new URL(path,location.origin).searchParams.get('days'))||7)
  if (path.startsWith('/dashboard')) return demoDashboard(path,body,false)
  if (path === '/company') {
    const {draftId,draftVersion,...company}=input as Partial<Profile> & {draftId?:string;draftVersion?:number}
    if (typeof company.inn !== 'string' || innError(company.inn) || !company.company?.trim()) throw new Error('Проверьте данные компании')
    if(draftId!==undefined){
      const key=prefix+'draft/'+draftId, draft=JSON.parse(localStorage.getItem(key)??'null')
      if(!draft||draft.version!==draftVersion||draft.inn&&draft.inn!==profile?.inn||draft.data.contractInput?.inn!==company.inn||demoContract(draftId))
        throw new Error('Черновик изменился. Откройте сохранённую версию и подтвердите ИНН.')
      localStorage.setItem(key,JSON.stringify({...draft,inn:company.inn}))
    }
    localStorage.setItem(prefix+'company',JSON.stringify(company))
    return {...session,profile:company}
  }
  if (path === '/offer-ai') {
    const condition = (input.offer as {title:string}).title.trim()
    const text = 'Скидка '+(input.offer as {discount:string}).discount+'% '+(condition || 'по промокоду')
    const title = text.length <= 60 ? text : condition
    return {source:'demo',answer:{status:'draft',patch:{title},options:[],question:null,visual:{action:'keep',assetId:null,prompt:null},logoAssetId:null}}
  }
  if (path === '/campaigns' && body) {
    if (!profile || input.inn !== profile.inn || typeof input.key !== 'string' || !validPromo(input.promo))
      throw new Error('Проверьте условия кампании')
    const id = input.key
    if (localStorage.getItem(receiptPrefix+id)) return {id,created:false}
    const saved=JSON.parse(localStorage.getItem(prefix+'draft/'+id)??'null')
    if(saved && saved.version!==input.draftVersion)throw new Error('Черновик изменился. Откройте сохранённую версию.')
    const contract=demoContract(id)
    if(!contract || contract.inn!==profile.inn || (!contract.signedAt && input.awaitSignature!==true)) throw new Error('Для запуска с переходом на модерацию нужен подписанный договор.')
    const receipt:Receipt = {id,profile,promo:input.promo,status:contract.signedAt?'review':'contract',publicId:null,submittedAt:Date.now()}
    try { localStorage.setItem(receiptPrefix+id,JSON.stringify(receipt)) }
    catch { throw new Error('Недостаточно места в браузере для тестовой кампании. Попробуйте фото меньшего размера.') }
    storeDemoContract({...contract,submissionId:id})
    localStorage.removeItem(prefix+'draft/'+id)
    return {id,created:true}
  }
  if (path.split('?')[0] === '/poster-sources') {
    const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset') ?? 0)
    const items = allReceipts().filter(r=>r.profile.inn===profile?.inn)
      .map(r=>({id:r.id,title:demoOffer(r).title,code:r.promo.code}))
    return {items:items.slice(offset,offset+25),more:offset+25<items.length}
  }
  if (path.startsWith('/poster-sources/')) {
    const r = readReceipt(path.slice('/poster-sources/'.length))
    if (r.profile.inn !== profile?.inn) throw new Error('Кампания не найдена в текущей компании')
    const design = designs.find(d=>d.file===r.promo.design)
    const edit = JSON.parse(localStorage.getItem(prefix+'offer-edit/'+r.id) ?? 'null')
    return posterSource({name:r.profile.company,inn:r.profile.inn,website:r.promo.site},demoOffer(r),
      r.promo.photo?.src || (design ? '/img/offer-variants/'+design.file : ''),r.promo.logo?.src || '',{brand:r.promo.brandName,...edit?.patch?.catalog})
  }
  if (path.startsWith('/campaigns/')) {
    const r=readReceipt(path.slice('/campaigns/'.length))
    return {...r,marketCopy:demoMarketCopy(r)}
  }
  if (path.split('?')[0] === '/campaigns') {
    const offset = Number(new URLSearchParams(path.split('?')[1]).get('offset') ?? 0)
    const items = allReceipts().map(r=>({id:r.id,code:r.promo.code,company:r.profile.company,submittedAt:r.submittedAt,status:r.status}))
    return {items:items.slice(offset,offset+25),more:items.length>offset+25}
  }
  throw new Error('Этот экран недоступен в демо партнёра')
}

function demoOffer({promo:p}:Receipt) {
  return promoOffer(p)
}

export async function mockStaffRequest(path:string,body?:object) {
  if (sessionStorage.getItem(prefix+'signed-in') !== 'staff') throw new Error('Войдите как тестовый сотрудник')
  const url=new URL(path,location.origin)
  const contractPath=/^\/contracts\/([\w-]+)(\/confirm)?$/.exec(path)
  if(contractPath){
    const record=demoContract(contractPath[1])
    if(!record)throw new Error('Договор не найден.')
    if(!contractPath[2])return record
    if(record.version!==(body as {version:number})?.version)throw new Error('Обновите версию договора.')
    if(!record.signedAt){record.signedAt=Date.now();record.signedBy=demoStaffEmail;storeDemoContract(record)}
    if(record.submissionId){
      const receipt=readReceipt(record.submissionId)
      if(receipt.status==='contract')await mockStaffRequest('/submissions/'+receipt.id+'/stage',{status:'review',version:receipt.review?.version??0})
    }
    return record
  }
  if(path==='/board')return [...demoContracts().filter(c=>!c.submissionId).map(c=>({id:c.id,kind:'contract',name:c.company,title:'Договор на размещение',code:'',email:c.email,inn:c.inn,version:c.version,submittedAt:c.createdAt,status:'contract'})),...allReceipts().map(r=>({kind:'campaign',inn:r.profile.inn,email:demoEmail,id:r.id,version:r.review?.version??0,status:r.status,title:demoOffer(r).title,name:r.profile.company,code:r.promo.code,submittedAt:r.submittedAt}))]
  if (path.startsWith('/dashboard')) return demoDashboard(path,body,true)
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
  const match = /^\/submissions\/([\w-]+)(\/review|\/stage)?$/.exec(path)
  if (!match) throw new Error('Раздел недоступен в демо сотрудника')
  const id = match[1]
  if (match[2]) return navigator.locks.request(prefix+'workflow',()=>{
    const r=readReceipt(id), old=r.review ?? emptyReview
    const request=(body??{}) as Partial<Review> & {status?:string}
    const target=match[2]==='/stage' ? (body as {status:PartnerCampaignStatus}).status : undefined
    const {reviewed,paid,erid}=target ? old : request
    if (target==='authorization')throw new Error('Авторизация доступна клиентам до запуска первой кампании.')
    if (target && !Object.hasOwn(campaignLabels,target))throw new Error('Неизвестный этап')
    if (typeof reviewed !== 'boolean' || typeof paid !== 'boolean' || typeof erid !== 'string' || !/^[A-Za-z0-9]{0,100}$/.test(erid)) throw new Error('Проверьте отметки и erid')
    if (target ? target===r.status : old.reviewed===reviewed && old.paid===paid && old.erid===erid) return {review:old,changed:false}
    if (request.version !== old.version) throw new Error('Кампания изменилась. Обновите её перед сохранением')
    const ready=reviewed && paid && !!erid
    const next=target ?? (ready && (!old.reviewed || !old.paid || !old.erid) ? 'published' : r.status==='published' && !ready ? 'stopped' : r.status)
    if(r.contract && !r.contract.signedAt && !['contract','archived'].includes(next))throw new Error('Сначала подтвердите получение подписанного договора.')
    if(next==='published' && !ready)throw new Error('Для активации проверьте оффер, укажите erid и подтвердите оплату.')
    if(next!=='archived' && r.promo.till && r.promo.till<promoDay())throw new Error('Срок действия предложения закончился')
    const active=next==='published',marketId=r.marketId ?? (active ? crypto.randomUUID() : undefined)
    const review:Review={version:old.version+1,reviewed,paid,erid,status:active ? 'published' : reviewed && erid && !paid ? 'awaiting_payment' : 'review',publicId:active ? marketId! : null}
    const events=[...(r.events??[])]
    if(next!==r.status){
      const latest=Math.max(0,...allReceipts().flatMap(receipt=>receipt.events?.at(-1)?.eventId??0))
      events.push({id,eventId:latest+1,createdAt:Date.now(),fromStage:r.status,toStage:next,title:demoOffer(r).title})
    }
    localStorage.setItem(receiptPrefix+id,JSON.stringify({...r,marketId,events,review,publicId:review.publicId,status:next}))
    return {review,changed:true}
  })
  const r=readReceipt(id), p=r.promo, company=r.profile
  return {id,status:r.status,submittedAt:r.submittedAt,review:r.review ?? emptyReview,marketCopy:demoMarketCopy(r),mvp:p,mvpProfile:company,email:demoEmail,
    business:{name:company.company,inn:company.inn,category:company.category ?? '',website:p.site,city:p.city ?? '',phone:''},
    addresses:p.addresses ?? [],online:!!p.online,offer:demoOffer(r),contract:r.contract,offerAccepted:r.contract?!!r.contract.signedAt:true,offerImage:p.photo?.name ?? null,logoImage:p.logo?.name ?? null,
    audience:[p.area,p.gender,p.age,p.income,p.moment].map((v,i)=>Math.max(0,audienceGroups[i].choices.indexOf(v ?? ''))),
    audienceCity:p.city,triggers:p.wishes ?? ''} satisfies V4Submission
}

function demoCatalogEntry(base:MarketOffer,key:string,origin:CatalogRecord['origin'],status:CatalogRecord['status']) {
  const edit=JSON.parse(localStorage.getItem(prefix+'offer-edit/'+key) ?? '{}')
  const card=applyCatalogPatch(base,edit.patch ?? {})
  const record:CatalogRecord={key,origin,status,publicId:status==='published' ? card.id : null,fields:catalogFields(card),version:edit.version ?? 0}
  return {base,card,record}
}
function demoPartnerEntry(r:DemoReceipt) {
  const base={...promoMarketCard(r.promo,r.contract?.company || r.profile.company,r.profile.category),
    id:r.marketId ?? r.publicId ?? r.id,erid:r.review?.erid ?? ''}
  return demoCatalogEntry(base,r.id,'partner',r.status==='archived' ? 'expired' : r.status==='published' && !!r.publicId ? 'published' : 'unpublished')
}
function demoMarketCopy(r:DemoReceipt) {
  const {record,card}=demoPartnerEntry(r)
  const {brand,benefit,condition}=record.fields
  return {catalog:{brand,benefit,condition},erid:card.erid}
}
function demoCatalog() {
  return allReceipts().map(demoPartnerEntry).concat(beelineOffers.map(card=>demoCatalogEntry(card,card.id,'beeline',
    card.offer.until && card.offer.until<promoDay() ? 'expired' : 'published')))
}

export function mockMarketRequest(path:string,body?:object) {
  const url=new URL(path,location.origin)
  const published=demoCatalog().filter(row=>row.record.status==='published')
  const offers=published.map(row=>row.card).concat(districtOffers)
  if(url.pathname.endsWith('/exposure') && body){
    const offer=published.find(row=>row.record.origin==='partner' && url.pathname==='/offers/'+row.card.id+'/exposure')
    if(!offer)throw new Error('Размещение недоступно')
    const {exposureId,placement,clicked}=body as {exposureId:string;placement:string;clicked:boolean}
    if(placement!=='market')throw new Error('Некорректный показ')
    demoResponseStart('impression-start')
    const key=prefix+'exposure/'+offer.card.id+'/'+exposureId
    const [time,source,prior]=localStorage.getItem(key)?.split('/')??[]
    if(!source || source===placement)localStorage.setItem(key,[time||Date.now(),placement,clicked||prior==='1'?'1':'0'].join('/'))
    return {ok:true}
  }
  if (url.pathname==='/offers') {
    const category=url.searchParams.get('category'), offset=Number(url.searchParams.get('offset') ?? 0)
    const nearby=inRadius(offers,Number(url.searchParams.get('radius') ?? 0))
    const items=nearby.filter(o=>!category || o.group===category)
    const categories: Record<string,number> = {}
    for (const offer of nearby) categories[offer.group] = (categories[offer.group] ?? 0) + 1
    return {items:items.slice(offset,offset+48),more:items.length>offset+48,categories}
  }
  if (url.pathname==='/search') {
    const {query,offset=0,radius=0}=body as {query:string;offset?:number;radius?:number}
    const {topic,maximum}=questionBudget(query)
    const words=searchWords(topic)
    const rank=(tokens:string[])=>offers.map(card=>({card,score:demoRank(card,tokens)})).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score || a.card.id.localeCompare(b.card.id))
    let hits=rank(words)
    const exact=hits.length>0
    if (!exact && words.length) {
      hits=rank(keyboardWords(topic))
      if (!hits.length) {
        const columns=offers.map(searchColumns)
        const vocabulary=new Set(columns.flatMap(c=>c.slice(0,3).join(' ').split(' ')))
        const all=new Set(columns.flatMap(c=>c.join(' ').split(' ')))
        const corrected=words.map(w=>Array.from(all).some(t=>t.startsWith(w)) ? w : spellingWord(w,vocabulary))
        hits=rank(corrected)
      }
    }
    const spelling = !exact && hits.length > 0
    const matched = hits.length ? hits.map(hit=>hit.card) : topic ? intentMatches(topic,offers) : offers
    const items = inRadius(matched.filter(card=>withinBudget(card,maximum)),radius)
    return {items:items.slice(offset,offset+48),total:items.length,more:items.length>offset+48,
      reply:(spelling ? 'По близкому написанию. ' : '')+searchReply(items.length)}
  }
  if(url.pathname.endsWith('/actions') && body) {
    const offer=offers.find(o=>url.pathname==='/offers/'+o.id+'/actions')
    if(!offer)throw new Error('Предложение больше недоступно')
    const {eventId,kind}=body as {eventId:string;kind:MarketAction}
    demoResponseStart()
    if(allReceipts().some(r=>r.publicId===offer.id)) {
      const key=prefix+'action/'+offer.id+'/'+eventId
      if(!localStorage.getItem(key))localStorage.setItem(key,Date.now()+'/'+kind)
    }
    return {ok:true}
  }
  const selecting = url.pathname.endsWith('/selection') && !!body
  const offer=offers.find(o=>url.pathname==='/offers/'+o.id+(selecting ? '/selection' : ''))
  if (!offer) throw new Error('Предложение больше недоступно')
  const chosen = prefix+'selected/'+offer.id
  if (selecting) localStorage.setItem(chosen,'1')
  const selectionCount = (offer.selectionCount ?? 0) + Number(localStorage.getItem(chosen)==='1')
  return selecting ? {selectionCount} : {...offer,selectionCount}
}
