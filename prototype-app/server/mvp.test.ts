import { after, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Promo } from '../shared/mvp-promo.ts'
import { validPromo } from '../shared/mvp-promo.ts'
import { periodStart } from '../shared/cabinet-dashboard.ts'
import { PreviewInbox } from './preview-inbox.ts'

const testDir = mkdtempSync(join(tmpdir(),'partner-platform-'))
process.env.DB_PATH = join(testDir,'test.sqlite')
process.env.ANTHROPIC_API_KEY = ''
after(() => { db.close(); rmSync(testDir,{recursive:true,force:true}) })
const { createMvp } = await import('./mvp.ts')
const { db } = await import('./db.ts')
const { createV4Staff } = await import('./v4-staff.ts')
const { app } = await import('./index.ts')
const { deliverCampaignMail, sendCampaignMail } = await import('./campaign-mail.ts')
const inbox = new Map<string,string>()
const api = createMvp(async (email, code) => { inbox.set(email, code) })
const staff = createV4Staff({ addresses:['employee@example.test'] }, async (email, code) => { inbox.set(email,code) })
const post = (body: object, cookie = '') => ({ method:'POST', headers:{ 'Content-Type':'application/json', Cookie:cookie }, body:JSON.stringify(body) })
const cookieOf = (res: Response) => res.headers.get('Set-Cookie')!.split(';')[0]
const profile = { inn:'7707083893', company:'Магазин', addr:'Москва, ул. Первая, 12' }
const promo = { code:'TEST20', off:'20', cond:'на первую покупку', site:'shop.example.test', till:'2099-07-01', fee:'9', check:'2500', via:'постбэк', design:'coffee-teal.png',
  addresses:[profile.addr, 'Москва, ул. Вторая, 33'], online:false, mode:'manual', area:'весь город', city:'Самара',
  gender:'женщины', age:'35 и старше', income:'выше среднего', moment:'день зарплаты', wishes:'По выходным' } satisfies Promo
const contractDetails={legalName:'ООО Партнёр',kpp:'770101001',ogrn:'1027700132195',legalAddress:'г. Самара',signer:'Анна Иванова',signerRole:'Директор',bank:'Банк',bik:'044525225',account:'40702810000000000001',correspondentAccount:'30101810000000000001',taxSystem:'УСН'}
function signedContract(email:string) {
  const id=randomUUID()
  db.prepare('insert into campaign_contracts(id,email,inn,company,created_at,signed_at) values (?,?,?,?,?,?)')
    .run(id,email,profile.inn,profile.company,Date.now(),Date.now())
  return id
}
async function login(email: string) {
  const response = await api.request('/code', post({email}))
  assert.equal(response.status, 200)
  const {challenge} = await response.json()
  const body = {email, challenge, code:inbox.get(email)!}
  const verified = await api.request('/verify',post(body))
  assert.equal(verified.status,200)
  assert.match(verified.headers.get('Set-Cookie')!, /HttpOnly/)
  assert.match(verified.headers.get('Set-Cookie')!, /SameSite=Strict/)
  assert.equal((await api.request('/verify',post(body))).status,401)
  return cookieOf(verified)
}
test('partner access requires a verified session, including reads after logout', async () => {
  assert.equal((await app.request('/api/mvp/campaigns')).status,401)
  assert.equal((await app.request('/api/mvp/session')).status,401)
  assert.equal((await api.request('/offer-ai',post({}))).status,401)
  const email = 'access@example.test'
  const cookie = await login(email)
  assert.equal((await api.request('/offer-ai',post({},cookie))).status,400)
  const session = await api.request('/session',{headers:{cookie}})
  assert.deepEqual(await session.json(),{email,profile:null})
  assert.match(session.headers.get('Cache-Control')!, /no-store/)
  assert.equal((await api.request('/company',post({...profile,inn:'0000000000'},cookie))).status,400)
  assert.equal((await api.request('/company',{method:'POST',headers:{cookie},body:'company=x'})).status,415)
  assert.equal((await api.request('/company',post(profile,cookie))).status,200)
  assert.equal((await api.request('/logout',post({},cookie))).status,200)
  assert.equal((await api.request('/campaigns',{headers:{cookie}})).status,401)
})

test('independent account drafts, optimistic updates, company scoping and atomic retirement on submission',async t=>{
  const email='draft-owner@example.test',cookie=await login(email),other=await login('draft-other@example.test')
  const id=randomUUID(),extra=randomUUID(),data={promo:{...promo,site:''},step:1,adReviewed:false,audienceReviewed:false,sourceReady:true}
  const path='/drafts/'+id, write=(version:number,patch=data)=>api.request(path,post({version,data:patch},cookie))
  assert.equal((await write(0)).status,200)
  assert.equal((await api.request('/drafts/'+extra,post({version:0,data},cookie))).status,200)
  assert.equal((await api.request(path,{headers:{cookie:other}})).status,404)
  assert.deepEqual(await (await api.request('/drafts',{headers:{cookie:other}})).json(),[])
  assert.equal((await write(1,{...data,step:2})).status,200)
  assert.equal((await write(1,{...data,step:3})).status,409)
  assert.equal((await api.request('/company',post(profile,cookie))).status,200)
  assert.equal((await (await api.request('/drafts',{headers:{cookie}})).json()).length,2)
  db.prepare('insert into campaign_contracts(id,email,inn,company,created_at,signed_at) values (?,?,?,?,?,?)').run(id,email,profile.inn,profile.company,Date.now(),Date.now())
  const send={key:id,inn:profile.inn,promo:data.promo,draftVersion:1}
  assert.equal((await api.request('/campaigns',post(send,cookie))).status,409)
  const submitted=await api.request('/campaigns',post({...send,draftVersion:2},cookie))
  assert.equal(submitted.status,201)
  const campaign=(await submitted.json()).id
  t.after(()=>{
    db.prepare('delete from campaign_contracts where id=?').run(id)
    db.prepare('delete from v4_submissions where id=?').run(campaign)
  })
  assert.equal((await write(2)).status,409)
  assert.deepEqual((await (await api.request('/drafts',{headers:{cookie}})).json()).map((r:{id:string})=>r.id),[extra])
})

test('a saved account INN cannot fill a new contract until the partner confirms the company for that draft', async()=>{
  const owner=await login('select-company@example.test'), other=await login('other-company@example.test')
  await api.request('/company',post(profile,owner))
  const id=randomUUID(),draft={promo,step:3,sourceReady:true,adReviewed:true,audienceReviewed:true,contractInput:{inn:'0000000018'}}
  await api.request('/drafts/'+id,post({version:0,data:draft},owner))
  const prepare=(inn:string,version:number)=>api.request('/contracts/'+id,post({inn,draftVersion:version,details:contractDetails,version:0},owner))
  assert.equal((await prepare(profile.inn,1)).status,422)
  const selection={inn:draft.contractInput.inn,company:'ООО Партнёр',addr:'',draftId:id,draftVersion:1}
  assert.equal((await api.request('/company',post(selection,other))).status,409)
  assert.equal((await api.request('/company',post({...selection,draftVersion:0},owner))).status,409)
  assert.equal((await api.request('/company',post(selection,owner))).status,200)
  assert.equal((await api.request('/drafts/'+id,post({version:1,data:{...draft,contractInput:{inn:selection.inn,confirmedInn:selection.inn}}},owner))).status,200)
  const contract=await prepare(selection.inn,2)
  assert.equal(contract.status,200)
  assert.equal((await contract.json()).inn,selection.inn)
  assert.equal((await api.request('/company',post({...selection,draftVersion:2},owner))).status,409)
})

test('failed delivery, expiry, wrong verification attempts and repeated requests never open a session', async () => {
  const unavailable = createMvp(async () => { throw new Error('local mail offline') })
  assert.equal((await unavailable.request('/code',post({email:'offline@example.test'}))).status,503)
  const email = 'limited@example.test'
  const {challenge} = await (await api.request('/code',post({email}))).json()
  assert.equal((await api.request('/code',post({email}))).status,429)
  const good = inbox.get(email)!
  for (let i=0; i<5; i++) assert.equal((await api.request('/verify',post({email,challenge,code:good === '000000' ? '111111' : '000000'}))).status,401)
  assert.equal((await api.request('/verify',post({email,challenge,code:good}))).status,401)
  const other = 'expired@example.test'
  const expired = await (await api.request('/code',post({email:other}))).json()
  db.prepare('update v4_email_codes set sent_at=? where draft_id=?').run(Date.now()-601_000,'mvp:'+expired.challenge)
  assert.equal((await api.request('/verify',post({...expired,email:other,code:inbox.get(other)}))).status,401)
})

test('parallel local preview logins receive separate one-use challenges', async () => {
  const mailbox = new PreviewInbox()
  const preview = createMvp(async () => { throw new Error('Unexpected mail') },undefined,mailbox)
  const email = mailbox.addresses[0]
  const responses = await Promise.all([1,2].map(()=>preview.request('/code',post({email}))))
  const challenges = await Promise.all(responses.map(async response => {
    assert.equal(response.status,200)
    return (await response.json()).challenge
  }))
  assert.notEqual(challenges[0],challenges[1])
  for (const challenge of challenges) {
    const code = mailbox.text(challenge).match(/ — (\d{6})/)![1]
    const verify = (value:string) => preview.request('/verify',post({email,challenge,code:value}))
    assert.equal((await verify(code === '000000' ? '111111' : '000000')).status,401)
    assert.equal((await verify(code)).status,200)
    assert.equal((await verify(code)).status,401)
    assert.doesNotMatch(mailbox.text(challenge),/ — \d{6}/)
  }
})

test('validation covers every section before the receipt or the mail queue is written', async () => {
  const cookie = await login('validation@example.test')
  await api.request('/company',post(profile,cookie))
  const submit = (p: unknown, accepted = true) => api.request('/campaigns',post({key:randomUUID(),inn:profile.inn,accepted,promo:p},cookie))
  assert.equal((await submit(promo,false)).status,422)
  assert.equal((await submit(promo,true)).status,422)
  const before = db.prepare('select count(*) n from v4_submissions').get()!.n
  for (const patch of [{code:'a'}, {off:'91'}, {cond:'x'.repeat(61)}, {site:'без сайта'}, {till:'2099-02-30'}, {fee:'2'}, {check:'0'},
    {via:'?'}, {design:'?'}, {mode:'?'}, {city:''}, {gender:'?'}, {age:'?'}, {income:'?'}, {moment:'?'}, {area:'?'}, {wishes:'x'.repeat(401)},
    {addresses:[]}, {addresses:['город, дом',' ГОРОД,  ДОМ ']}, {addresses:[5]}, {online:true,area:'рядом с точкой'},
    {photo:{name:'фото.png',src:'data:image/png;base64,YWJj'}}]) {
    assert.equal((await submit({...promo,...patch})).status,422,JSON.stringify(patch))
  }
  assert.equal(db.prepare('select count(*) n from v4_submissions').get()!.n,before)
  assert.equal(validPromo({...promo,online:true,addresses:[],mode:'auto',area:'вся Россия',city:undefined}),true)
})

test('submission, retry, owner receipt, staff search/detail, image and queued mail agree', async () => {
  const email = 'partner@example.test'
  const owner = await login(email), other = await login('other@example.test')
  await api.request('/company',post(profile,owner))
  await api.request('/company',post(profile,other))
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yFYcAAAAASUVORK5CYII='
  const photo = {name:'кофе.png',src:'data:image/png;base64,'+png}
  const payload = {inn:profile.inn,key:signedContract(email),promo:{...promo,photo}}
  const responses = await Promise.all([1,2].map(() => api.request('/campaigns',post(payload,owner))))
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201])
  const [{id}, retry] = await Promise.all(responses.map(r=>r.json()))
  assert.equal(retry.id,id)
  const received = await (await api.request('/campaigns/'+id,{headers:{cookie:owner}})).json()
  assert.deepEqual(received.profile,profile)
  assert.deepEqual(received.promo,payload.promo)
  assert.equal((await (await api.request('/campaigns',{headers:{cookie:owner}})).json()).items.length,1)
  assert.deepEqual((await (await api.request('/campaigns',{headers:{cookie:other}})).json()).items,[])
  assert.equal((await api.request('/campaigns/'+id,{headers:{cookie:other}})).status,404)
  assert.equal((await staff.request('/submissions/'+id,{headers:{cookie:owner}})).status,401)
  const employee = 'employee@example.test'
  await staff.request('/code',post({email:employee}))
  const staffCookie = cookieOf(await staff.request('/verify',post({email:employee,code:inbox.get(employee)})))
  const found = await (await staff.request('/submissions/search',post({query:email},staffCookie))).json()
  assert.equal(found.items[0].id,id)
  const readOverview = async (cookie:string) => (await api.request('/dashboard',{headers:{cookie}})).json()
  const empty = await readOverview(other)
  assert.deepEqual(empty.groups,[])
  assert.deepEqual(empty.recent,[])
  const overview = await readOverview(owner)
  assert.deepEqual(overview.recent.map((row:{id:string})=>row.id),[id])
  assert.deepEqual(overview.groups,[{day:overview.today,status:'review',channel:'places',verified:0,count:1}])
  const filtered = await (await api.request('/dashboard/rows',post({q:'МАГАЗИН',status:'review',page:'9'},owner))).json()
  assert.equal(filtered.page,1)
  assert.equal(filtered.total,1)
  assert.equal(filtered.items[0].id,id)
  const periodRows=async(days:number)=>(await (await api.request('/dashboard/rows',post({days,status:'review'},owner))).json()).items
  const lastWeek=(overview.today-6)*86_400_000-10_800_000
  db.prepare('update v4_submissions set submitted_at=? where id=?').run(lastWeek-1,id)
  assert.equal((await periodRows(7)).length,0)
  assert.equal((await periodRows(30))[0].id,id)
  db.prepare('update v4_submissions set submitted_at=? where id=?').run(lastWeek,id)
  assert.equal((await periodRows(7))[0].id,id)
  db.prepare('update v4_submissions set submitted_at=? where id=?').run(overview.recent[0].submittedAt,id)
  assert.equal((await (await api.request('/dashboard/rows',post({q:email},other))).json()).total,0)
  assert.equal((await staff.request('/dashboard',{headers:{cookie:owner}})).status,401)
  assert.equal((await staff.request('/dashboard/rows',post({q:email},owner))).status,401)
  assert.equal((await (await staff.request('/dashboard/rows',post({q:email},staffCookie))).json()).items[0].id,id)
  const card = await (await staff.request('/submissions/'+id,{headers:{cookie:staffCookie}})).json()
  assert.deepEqual(card.mvp,promo)
  assert.deepEqual(card.mvpProfile,profile)
  assert.deepEqual(card.audience,[1,1,2,2,2])
  assert.deepEqual(card.addresses,promo.addresses)
  assert.equal(card.email,email)
  assert.equal(card.offer.promo,promo.code)
  assert.equal(card.offerImage,photo.name)
  const image = await staff.request('/submissions/'+id+'/offer-image',{headers:{cookie:staffCookie}})
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),png)
  let deliveries = 0
  const deliver = () => deliverCampaignMail(row => sendCampaignMail(row,'robot@example.test',async message => {
    deliveries++
    for (const value of [email,profile.company, ...promo.addresses!,promo.code,promo.via,promo.fee+' %',promo.check+' ₽',promo.city!,promo.wishes!]) assert.ok(String(message.text).includes(value),value)
    assert.equal(message.attachments?.at(-1)?.content?.toString('base64'),png)
  }))
  await deliver(); await deliver()
  assert.equal(deliveries,1)
  assert.ok(db.prepare('select mail_sent_at from v4_submissions where id=?').get(id)?.mail_sent_at)
})


test('print sources use verified email and current INN for both intake paths, including original artwork', async () => {
  const email = 'print@example.test', owner = await login(email)
  const other = await login('another-print@example.test')
  for (const cookie of [owner,other]) await api.request('/company',post(profile,cookie))
  const {id} = await (await api.request('/campaigns',post({inn:profile.inn,key:signedContract(email),promo},owner))).json()
  const list = async (cookie:string) => (await api.request('/poster-sources',{headers:{cookie}})).json()
  const detail = (cookie:string,key:string) => api.request('/poster-sources/'+key,{headers:{cookie}})
  assert.equal((await api.request('/poster-sources')).status,401)
  const guarded = await api.request('/poster-sources',{headers:{cookie:owner,'X-Mvp-Account':'another-print@example.test'}})
  assert.equal(guarded.status,409)
  const asStaff = createMvp(async()=>{},()=>'staff')
  for (const path of ['/poster-sources','/poster-sources/'+id]) {
    assert.equal((await asStaff.request(path,{headers:{cookie:owner}})).status,403)
  }
  const ownResponse = await detail(owner,id)
  assert.match(ownResponse.headers.get('Cache-Control') ?? '',/no-store/)
  assert.equal(ownResponse.headers.get('X-Content-Type-Options'),'nosniff')
  const poster = await ownResponse.json()
  assert.equal(poster.image,'/img/offer-variants/coffee-teal.png')
  assert.equal(poster.benefit,'−20%')
  assert.match(poster.subline,/TEST20/)
  assert.match(poster.terms,/01\.07\.2099/)
  const v4id=randomUUID()
  const submitted=JSON.parse(String(db.prepare('select data from v4_submissions where id=?').get(id)!.data))
  const source={...submitted,email:email.toUpperCase(),mvp:undefined,mvpProfile:undefined,
    logoImage:{name:'logo.png',type:'image/png',base64:'bG9nbw=='},offerImage:{name:'photo.webp',type:'image/webp',base64:'cGhvdG8='}}
  db.prepare('insert into v4_submissions(id,draft_id,digest,data,submitted_at,mail_next_at) values(?,?,?,?,?,?)')
    .run(v4id,v4id,'fixture',JSON.stringify(source),Date.now()+1,Date.now())
  assert.deepEqual((await list(owner)).items.map((item:{id:string})=>item.id),[v4id,id])
  const creative=await (await detail(owner,v4id)).json()
  assert.equal(creative.image,'data:image/webp;base64,cGhvdG8=')
  assert.equal(creative.logo,'data:image/png;base64,bG9nbw==')
  assert.deepEqual((await list(other)).items,[])
  assert.equal((await detail(other,v4id)).status,404)
  assert.equal((await detail(other,id)).status,404)
  assert.equal((await api.request('/poster-sources?offset=-1',{headers:{cookie:owner}})).status,400)
  assert.equal((await detail('',id)).status,401)
  assert.equal((await api.request('/company',post({...profile,inn:'7701000001'},owner))).status,200)
  assert.deepEqual((await list(owner)).items,[])
  assert.equal((await detail(owner,id)).status,404)
})

test('publication requires all staff confirmations, persists after restart and expires everywhere', async () => {
  const owner = await login('market-owner@example.test')
  const member = 'moderator@example.test'
  db.prepare('insert into v4_staff_members values (?,?,?)').run(member,Date.now(),'fixture')
  const moderator = await login(member)
  const moderatorSession = await (await api.request('/session',{headers:{cookie:moderator}})).json()
  assert.equal(moderatorSession.role,'staff')
  assert.equal((await api.request('/campaigns',{headers:{cookie:moderator}})).status,403)
  assert.equal((await staff.request('/team',{headers:{cookie:moderator}})).status,403)
  const partner = {...profile,category:'Кофейня',addr:'Юридический адрес партнёра'}
  await api.request('/company',post(partner,owner))
  const submission = await api.request('/campaigns',post({inn:profile.inn,key:signedContract('market-owner@example.test'),promo:{...promo,design:'plain'}},owner))
  assert.equal(submission.status,201)
  const {id} = await submission.json()
  const reviewPath = '/submissions/'+id+'/review'
  const save = (reviewed:boolean,paid:boolean,erid:string,version:number,cookie=moderator) => staff.request(reviewPath,post({reviewed,paid,erid,version},cookie))
  const publicApi = (path:string) => app.request('/api/market/offers'+path)
  const feed = async () => (await (await publicApi('')).json()).items.filter((o: {source?:unknown})=>!o.source)
  assert.equal((await save(true,true,'ExampleErid',0,owner)).status,401)
  assert.equal((await save(true,true,'ExampleErid',0,'')).status,401)
  assert.equal((await save(true,true,'bad erid',0)).status,400)
  assert.equal((await save(false,true,'ExampleErid',0)).status,200)
  assert.deepEqual(await feed(),[])
  assert.equal((await save(true,false,'ExampleErid',0)).status,409)
  assert.equal((await save(true,true,'',1)).status,200)
  assert.deepEqual(await feed(),[])
  const confirmed = await (await save(true,true,'ExampleErid',2)).json()
  const key = confirmed.review.publicId
  assert.ok(key && key !== id)
  assert.equal(confirmed.review.status,'published')
  assert.equal((await (await save(true,true,'ExampleErid',2)).json()).changed,false)
  assert.equal((await publicApi('/'+id)).status,404)
  const live = await feed()
  assert.equal(live.length,1)
  assert.equal(live[0].id,key)
  assert.equal(live[0].image,'')
  assert.equal((await publicApi('/'+key+'/image')).status,404)
  assert.deepEqual(live[0].addresses,promo.addresses)
  assert.equal(live[0].group,'food')
  for (const privateValue of [id,partner.inn,partner.addr,member,'market-owner@example.test',promo.via,promo.wishes,promo.check]) {
    assert.ok(!JSON.stringify(live).includes(privateValue!),String(privateValue))
  }
  assert.equal((await (await publicApi('?category=beauty')).json()).items.length,0)
  assert.equal((await publicApi('?offset=-1')).status,400)
  const persisted = execFileSync(process.execPath,['--disable-warning=ExperimentalWarning','--input-type=module','-e',
    "const {app}=await import('./server/index.ts'); const r=await app.request('/api/market/offers'); console.log((await r.json()).items[0].id)"],
    {encoding:'utf8'})
  assert.equal(persisted.trim(),key)
  const partnerStatus = async () => {
    const status = (await (await api.request('/campaigns/'+id,{headers:{cookie:owner}})).json()).status
    const rows = await (await api.request('/dashboard/rows',post({status},owner))).json()
    const overview = await (await api.request('/dashboard',{headers:{cookie:owner}})).json()
    assert.equal(rows.items[0].status,status)
    assert.equal(overview.groups[0].status,status)
    return status
  }
  assert.equal(await partnerStatus(),'published')
  await save(true,false,'ExampleErid',3)
  assert.equal(await partnerStatus(),'stopped')
  assert.equal((await publicApi('/'+key)).status,404)
  const resumed = await (await save(true,true,'ExampleErid',4)).json()
  assert.equal(resumed.review.publicId,key)
  assert.equal(await partnerStatus(),'published')
  db.prepare("update market_publications set until_day='2000-01-01' where submission_id=?").run(id)
  assert.equal(await partnerStatus(),'archived')
  assert.deepEqual(await feed(),[])
  assert.equal((await publicApi('/'+key)).status,404)
  const search = await app.request('/api/market/search',post({query:'Кофейня'}))
  assert.deepEqual((await search.json()).items.filter((o:{source?:unknown})=>!o.source),[])
  const receipt = await api.request('/campaigns/'+id,{headers:{cookie:owner}})
  assert.equal((await receipt.json()).status,'archived')
  db.prepare('delete from v4_staff_members where email=?').run(member)
  assert.equal((await save(false,true,'ExampleErid',5)).status,401)
})

test('public deployment serves platform API without exposing prototype actions or legacy login', async () => {
  const mode = process.env.PARTNERS_ONLY
  process.env.PARTNERS_ONLY = 'true'
  try {
    assert.equal((await app.request('/api/health')).status,200)
    assert.equal((await app.request('/api/market/offers')).status,200)
    assert.equal((await app.request('/api/mvp/session')).status,401)
    assert.equal((await app.request('/api/v4/staff/submissions/search',post({}))).status,401)
    for (const path of ['/api/session','/api/catalog','/api/v4/staff/code','/api/v4/staff/verify']) {
      const res = await app.request(path,path.includes('/staff/') ? post({}) : {})
      assert.equal(res.status,404,path)
      assert.equal(res.headers.get('Set-Cookie'),null)
    }
  } finally {
    if (mode === undefined) delete process.env.PARTNERS_ONLY
    else process.env.PARTNERS_ONLY=mode
  }
})

test('staff edits persist, reindex immediately, reject stale writes and preserve the publication gate',async()=>{
  const worker='registry-staff@example.test'
  db.prepare('insert into v4_staff_members values(?,?,?)').run(worker,Date.now(),'fixture')
  const staffCookie=await login(worker), partnerCookie=await login('registry-partner@example.test')
  const id='beef0000-0000-5000-8000-000000004263', url='/offers/'+id
  assert.equal((await staff.request('/offers')).status,401)
  assert.equal((await staff.request(url,{headers:{cookie:partnerCookie}})).status,401)
  const read=async()=>await (await staff.request(url,{headers:{cookie:staffCookie}})).json()
  const before=await read()
  const changes={version:before.version,fields:{...before.fields,brand:'Студия ирисов',description:'Бесплатная каллиграфия',group:'fun'}}
  assert.equal((await staff.request(url,post(changes,partnerCookie))).status,401)
  assert.equal((await staff.request(url,post({...changes,fields:{...changes.fields,group:'missing'}},staffCookie))).status,400)
  assert.equal((await staff.request(url,post(changes,staffCookie))).status,200)
  assert.equal((await staff.request(url,post(changes,staffCookie))).status,409)
  const find=async(q:string)=>await (await app.request('/api/market/search',post({query:q}))).json()
  assert.equal((await find('каллиграфия')).items[0].catalog.brand,'Студия ирисов')
  const restarted=execFileSync(process.execPath,['--disable-warning=ExperimentalWarning','--input-type=module','-e',
    "await import('./server/market.ts');const {searchMarket}=await import('./server/market-catalog.ts');console.log(searchMarket('каллиграфия',0).items[0].catalog.brand)"],{encoding:'utf8'})
  assert.equal(restarted.trim(),'Студия ирисов')
  const previous=await read()
  await staff.request(url,post({version:previous.version,fields:before.fields},staffCookie))
  assert.equal((await find('каллиграфия')).total,0)
  const hidden=(await (await staff.request('/offers?status=unpublished',{headers:{cookie:staffCookie}})).json()).items
  assert.ok(hidden.some((r:{origin:string})=>r.origin==='partner'))
  const draft=hidden[0]
  assert.equal((await staff.request('/offers/'+draft.key,post({version:draft.version,fields:{...draft.fields,brand:'Телемастерская'}},staffCookie))).status,200)
  assert.equal((await find('Телемастерская')).total,0)
})

test('board moves are versioned, update both cabinets and the market, and notify only the owner',async()=>{
  const owner=await login('stage-owner@example.test'), stranger=await login('stage-stranger@example.test')
  const employee='stage-staff@example.test'
  db.prepare('insert into v4_staff_members values (?,?,?)').run(employee,Date.now(),'fixture')
  const moderator=await login(employee)
  const cards=async()=>await (await staff.request('/board',{headers:{cookie:moderator}})).json() as {id:string;kind:string;email:string;inn:string;status:string}[]
  const stageCounts=async()=>{
    const overview=await (await staff.request('/dashboard',{headers:{cookie:moderator}})).json()
    const counts:Record<string,number>={}
    for(const row of overview.funnel)counts[row.status]=(counts[row.status]??0)+row.count
    return counts
  }
  const baseline=await stageCounts()
  const before=(await cards()).filter(c=>c.email==='stage-owner@example.test')
  assert.equal(before.length,1)
  assert.equal(before[0].kind,'client')
  assert.equal(before[0].status,'authorization')
  assert.equal((await cards()).some(c=>c.email===employee),false)
  await api.request('/company',post(profile,owner))
  assert.equal((await cards()).find(c=>c.id===before[0].id)?.inn,profile.inn)
  const authRows=await (await staff.request('/dashboard/rows',post({q:profile.inn.slice(0,6),status:'authorization'},moderator))).json()
  assert.ok(authRows.items.some((r:{id:string})=>r.id===before[0].id))
  const {id}=await (await api.request('/campaigns',post({inn:profile.inn,key:signedContract('stage-owner@example.test'),promo},owner))).json()
  const board=async()=>(await (await staff.request('/board',{headers:{cookie:moderator}})).json() as {id:string;version:number;status:string}[]).find(r=>r.id===id)!
  const move=(status:string,version:number,cookie=moderator)=>staff.request('/submissions/'+id+'/stage',post({status,version},cookie))
  const notices=async(cookie:string)=>(await (await api.request('/notifications',{headers:{cookie}})).json())
  assert.equal((await staff.request('/board',{headers:{cookie:owner}})).status,401)
  assert.equal((await move('contract',0,owner)).status,401)
  assert.equal((await move('invented',0)).status,400)
  assert.equal((await move('published',0)).status,422)
  assert.equal((await board()).status,'review')
  assert.equal((await move('authorization',0)).status,422)
  assert.equal((await notices(owner)).unread,0)
  const both=await Promise.all([move('contract',0),move('archived',0)])
  assert.deepEqual(both.map(r=>r.status).sort(),[200,409])
  const first=await board()
  assert.equal((await (await move(first.status,0)).json()).changed,false)
  const second=first.status==='contract'?'archived':'contract'
  await move(second,first.version)
  const published=await (await staff.request('/submissions/'+id+'/review',post({reviewed:true,paid:true,erid:'StageErid',version:2},moderator))).json()
  const marketPath='/api/market/offers/'+published.review.publicId
  assert.equal((await app.request(marketPath)).status,200)
  const responses=async(cookie:string,days=7)=>await (await api.request('/statistics/responses?days='+days,{headers:{cookie}})).json()
  const act=(kind:string,eventId=crypto.randomUUID())=>app.request(marketPath+'/actions',post({kind,eventId}))
  const expose=(exposureId:string,placement:string,clicked:boolean)=>app.request(marketPath+'/exposure',post({exposureId,placement,clicked}))
  const exposureId=crypto.randomUUID()
  assert.equal((await expose(exposureId,'landing',true)).status,400)
  // Rows saved by the former landing integration must not affect the market report.
  db.prepare("insert into market_exposures values(?,?,'landing',?,1)").run(id,crypto.randomUUID(),Date.now())
  assert.equal((await expose(exposureId,'market',true)).status,200)
  assert.equal((await expose(exposureId,'market',false)).status,200)
  assert.equal((await expose(exposureId,'market',true)).status,200)
  assert.equal((await expose(crypto.randomUUID(),'market',false)).status,200)
  assert.equal((await expose(crypto.randomUUID(),'unknown',false)).status,400)
  assert.equal((await expose('broken','market',false)).status,400)
  const key=crypto.randomUUID()
  assert.equal((await act('open',key)).status,200)
  assert.equal((await act('open',key)).status,200)
  for(const kind of ['reveal','site','route'])assert.equal((await act(kind)).status,200)
  assert.equal((await act('unknown')).status,400)
  const counts=(await responses(owner)).items.find((item:{id:string})=>item.id===id)
  assert.deepEqual([counts.opens,counts.reveals,counts.sites,counts.routes],[1,1,1,1])
  assert.deepEqual([counts.landingShows,counts.landingClicks,counts.marketShows,counts.marketClicks],[0,0,2,1])
  assert.equal((await responses(owner)).daily.reduce((n:number,d:{clicks:number})=>n+d.clicks,0),3)
  assert.deepEqual((await responses(stranger)).daily,[])
  const observedAt=db.prepare("update market_exposures set seen_at=? where submission_id=? and placement='market'")
  for(const days of [7,30,90]){
    const midnight=periodStart(days,Date.now())
    observedAt.run(midnight-1,id)
    assert.equal((await responses(owner,days)).items[0].marketShows,0)
    if(days<90)assert.equal((await responses(owner,90)).items[0].marketShows,2)
    observedAt.run(midnight,id)
    const row=(await responses(owner,days)).items[0]
    assert.deepEqual([row.marketShows,row.marketClicks],[2,1])
  }
  assert.deepEqual((await responses(stranger)).items,[])
  assert.equal((await api.request('/statistics/responses?days=7')).status,401)
  assert.equal((await api.request('/statistics/responses?days=2',{headers:{cookie:owner}})).status,400)
  db.prepare("update market_actions set occurred_at=occurred_at-8*86400000 where submission_id=? and kind='site'").run(id)
  assert.equal((await responses(owner)).items[0].sites,0)
  assert.equal((await responses(owner,30)).items[0].sites,1)
  for(const [version,status] of [[3,'stopped'],[4,'published'],[5,'archived'],[6,'review']] as const){
    assert.equal((await move(status,version)).status,200)
    assert.equal((await board()).status,status)
    assert.equal((await (await api.request('/campaigns/'+id,{headers:{cookie:owner}})).json()).status,status)
    assert.equal((await app.request(marketPath)).status,status==='published'?200:404)
  }
  assert.equal((await expose(crypto.randomUUID(),'market',false)).status,404)
  assert.equal((await act('open')).status,404)
  assert.equal((await responses(owner)).items[0].opens,1)
  assert.equal((await cards()).some(c=>c.id===before[0].id),false)
  const overview=async(cookie:string)=>await (await api.request('/dashboard',{headers:{cookie}})).json()
  assert.equal('funnel' in (await overview(owner)),false)
  assert.equal('funnel' in (await overview(stranger)),false)
  const visits=await stageCounts()
  for (const stage of ['contract','review','published','stopped','archived']) assert.equal(visits[stage],(baseline[stage]??0)+1)
  assert.equal(visits.authorization,baseline.authorization)
  const feed=await notices(owner)
  assert.equal(feed.unread,7)
  assert.equal(feed.items[0].fromStage,'archived')
  assert.equal(feed.items[0].toStage,'review')
  assert.equal(feed.items[0].id,id)
  assert.deepEqual((await notices(stranger)).items,[])
  await api.request('/notifications/read',post({through:feed.items[0].eventId},stranger))
  assert.equal((await notices(owner)).unread,7)
  await api.request('/notifications/read',post({through:feed.items[1].eventId},owner))
  assert.equal((await notices(owner)).unread,1)
  await api.request('/notifications/read',post({through:feed.items[0].eventId},owner))
  assert.equal((await notices(owner)).unread,0)
  const older=await (await api.request('/notifications?before='+feed.items[1].eventId,{headers:{cookie:owner}})).json()
  assert.deepEqual(older.items,feed.items.slice(2))
  const another=await api.request('/campaigns',post({inn:profile.inn,key:signedContract('stage-owner@example.test'),promo},owner))
  assert.equal(another.status,201)
  const later=await stageCounts()
  assert.equal(later.authorization,visits.authorization)
  assert.equal(later.contract,visits.contract+1)
  assert.equal(later.review,visits.review+1)
  assert.equal((await cards()).filter(c=>c.email==='stage-owner@example.test' && c.kind==='client').length,0)
  assert.equal(db.prepare('select count(*) n from campaign_stage_events where submission_id=? and employee=? and recipient=?').get(id,employee,'stage-owner@example.test')!.n,7)
})

test('contract versions, PDF, owner email and manual signature govern handoff to moderation',async()=>{
  const email='contract-owner@example.test', owner=await login(email), other=await login('contract-other@example.test')
  const employee='signature-staff@example.test'
  db.prepare('insert into v4_staff_members values (?,?,?)').run(employee,Date.now(),'fixture')
  const manager=await login(employee), id=randomUUID(), path='/contracts/'+id
  await api.request('/company',post(profile,owner))
  const details={...contractDetails,legalName:'ООО «Партнёр»'}
  const {PDFDocument}=await import('pdf-lib')
  const annex=await PDFDocument.create();annex.addPage()
  const attachment={name:'карточка.pdf',type:'application/pdf',base64:Buffer.from(await annex.save()).toString('base64')}
  const prepared=await api.request(path,post({inn:profile.inn,details,attachment,version:0},owner))
  assert.equal(prepared.status,200)
  assert.equal((await prepared.json()).signedAt,null)
  assert.equal((await api.request(path+'/pdf',{headers:{cookie:other}})).status,404)
  assert.equal((await api.request(path+'/email',post({},other))).status,404)
  const firstPdf=await (await api.request(path+'/pdf',{headers:{cookie:owner}})).arrayBuffer()
  assert.equal((await PDFDocument.load(firstPdf)).getPageCount(),20)
  assert.equal((await api.request(path,post({inn:profile.inn,details,version:1},owner))).status,200)
  assert.equal((await staff.request(path+'/confirm',post({version:1},manager))).status,409)
  const payload={key:id,inn:profile.inn,promo}
  assert.equal((await api.request('/campaigns',post({...payload,accepted:true},owner))).status,422)
  assert.equal((await api.request('/campaigns',post({...payload,awaitSignature:true},other))).status,422)
  const waiting=await api.request('/campaigns',post({...payload,awaitSignature:true},owner))
  assert.equal(waiting.status,201)
  const campaign=(await waiting.json()).id,read=async()=>await (await api.request('/campaigns/'+campaign,{headers:{cookie:owner}})).json()
  assert.equal((await read()).status,'contract')
  assert.equal((await api.request(path,post({inn:profile.inn,details,version:2},owner))).status,409)
  assert.equal((await staff.request('/submissions/'+campaign+'/stage',post({status:'review',version:0},manager))).status,422)
  assert.equal((await staff.request(path+'/confirm',post({version:2},owner))).status,401)
  assert.equal((await staff.request(path+'/confirm',post({version:2},manager))).status,200)
  const after=await read()
  assert.equal(after.status,'review')
  assert.ok(after.contract.signedAt)
  assert.equal((await staff.request(path+'/confirm',post({version:2},manager))).status,200)
  assert.equal(db.prepare('select count(*) n from campaign_stage_events where submission_id=?').get(campaign)?.n,1)
  assert.equal((await api.request('/campaigns',post({...payload,promo:{...promo,code:'ANOTHER'}},owner))).status,409)
})
