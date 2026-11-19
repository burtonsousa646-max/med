import { after, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { Promo } from '../shared/mvp-promo.ts'
import { validPromo } from '../shared/mvp-promo.ts'
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
const promo: Promo = { code:'TEST20', off:'20', cond:'на первую покупку', site:'shop.example.test', till:'2099-07-01', fee:'9', check:'2500', via:'постбэк', design:'coffee-teal.png',
  addresses:[profile.addr, 'Москва, ул. Вторая, 33'], online:false, mode:'manual', area:'весь город', city:'Самара',
  gender:'женщины', age:'35 и старше', income:'выше среднего', moment:'день зарплаты', wishes:'По выходным' }
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
  const email = 'access@example.test'
  const cookie = await login(email)
  const session = await api.request('/session',{headers:{cookie}})
  assert.deepEqual(await session.json(),{email,profile:null})
  assert.match(session.headers.get('Cache-Control')!, /no-store/)
  assert.equal((await api.request('/company',post({...profile,inn:'0000000000'},cookie))).status,400)
  assert.equal((await api.request('/company',{method:'POST',headers:{cookie},body:'company=x'})).status,415)
  assert.equal((await api.request('/company',post(profile,cookie))).status,200)
  assert.equal((await api.request('/logout',post({},cookie))).status,200)
  assert.equal((await api.request('/campaigns',{headers:{cookie}})).status,401)
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
  const payload = {inn:profile.inn,key:randomUUID(),accepted:true,promo:{...promo,photo}}
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
  const submission = await api.request('/campaigns',post({inn:profile.inn,key:randomUUID(),accepted:true,promo},owner))
  assert.equal(submission.status,201)
  const {id} = await submission.json()
  const reviewPath = '/submissions/'+id+'/review'
  const save = (reviewed:boolean,paid:boolean,erid:string,version:number,cookie=moderator) => staff.request(reviewPath,post({reviewed,paid,erid,version},cookie))
  const publicApi = (path:string) => app.request('/api/market/offers'+path)
  const feed = async () => (await (await publicApi('')).json()).items
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
  const partnerStatus = async () => (await (await api.request('/campaigns/'+id,{headers:{cookie:owner}})).json()).status
  assert.equal(await partnerStatus(),'published')
  await save(true,false,'ExampleErid',3)
  assert.equal(await partnerStatus(),'stopped')
  assert.equal((await publicApi('/'+key)).status,404)
  const resumed = await (await save(true,true,'ExampleErid',4)).json()
  assert.equal(resumed.review.publicId,key)
  assert.equal(await partnerStatus(),'published')
  db.prepare("update market_publications set until_day='2000-01-01' where submission_id=?").run(id)
  assert.deepEqual(await feed(),[])
  assert.equal((await publicApi('/'+key)).status,404)
  const search = await app.request('/api/market/search',post({query:'Кофейня'}))
  assert.deepEqual((await search.json()).items,[])
  const receipt = await api.request('/campaigns/'+id,{headers:{cookie:owner}})
  assert.equal((await receipt.json()).status,'expired')
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
