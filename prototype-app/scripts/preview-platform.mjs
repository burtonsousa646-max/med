// Isolated loopback preview. Run after npm run build. No external email is sent.
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

if (existsSync('.env')) process.loadEnvFile('.env')
if (existsSync('.env.autocomplete')) process.loadEnvFile('.env.autocomplete')
const directory = process.env.LOCAL_PREVIEW_DIRECTORY || mkdtempSync(join(tmpdir(),'beepartners-preview-'))
// Keep loaded tabs independent of subsequent Vite builds and retain their hashed assets on restart.
const webRoot = join(directory,'web')
cpSync('dist',webRoot,{recursive:true})
process.env.DB_PATH = join(directory,'preview.sqlite')
delete process.env.ANTHROPIC_API_KEY
const { createMvp } = await import('../server/mvp.ts')
const { createV4Staff } = await import('../server/v4-staff.ts')
const { market } = await import('../server/market.ts')
const { createAutocomplete } = await import('../server/autocomplete.ts')
const { savePartnerRegistry } = await import('../server/partner-registry.ts')
const { db } = await import('../server/db.ts')
const {PreviewInbox} = await import('../server/preview-inbox.ts')
const inbox = new PreviewInbox()
db.prepare('insert or ignore into v4_staff_members values (?,?,?)').run('staff@example.test',Date.now(),'local-preview')
const send = async () => { throw new Error('Use a local preview address') }
const app = new Hono()
app.use('*',async (c,next)=>{
  if (!['127.0.0.1:5184','localhost:5184'].includes(c.req.header('host'))) return c.notFound()
  c.header('Cache-Control','no-store')
  c.header('X-Content-Type-Options','nosniff')
  await next()
})
app.get('/local-inbox',c=>{
  return c.text('Тестовая почта · только на этом компьютере\n\n'+inbox.text(c.req.query('challenge') ?? null))
})
db.exec('create table if not exists preview_contract_mail(recipient text,id text,document blob,sent_at integer)')
const sendDocument=async(email,pdf,id)=>{
  db.prepare('insert into preview_contract_mail values (?,?,?,?)').run(email,id,pdf,Date.now())
}
const mvp=createMvp(send,undefined,inbox,sendDocument)
app.route('/api/mvp',mvp)
const {campaignSite}=await import('../server/campaign-site.ts')
app.route('/api/v4',campaignSite)
app.get('/api/local-contract-mail/:id',async c=>{
  const response=await mvp.request('/session',{headers:{Cookie:c.req.header('Cookie')??''}})
  if(!response.ok)return c.notFound()
  const session=await response.json()
  if(session.role)return c.notFound()
  const row=db.prepare('select document from preview_contract_mail where recipient=? and id=? order by sent_at desc limit 1').get(session.email,c.req.param('id'))
  return row?c.body(row.document,200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="contract.pdf"','Cache-Control':'private, no-store'}):c.notFound()
})
const {deliverStatusMail} = await import('../server/campaign-status-mail.ts')
db.exec('create table if not exists preview_status_mail(id text primary key,recipient text,body text)')
const storeMail = db.prepare('insert or ignore into preview_status_mail values (?,?,?)')
setInterval(() => void deliverStatusMail('cabinet@preview.test', async mail => {
  storeMail.run(mail.messageId,mail.to[0].address,mail.text)
}),1000).unref()
app.get('/api/local-status-mail',async c => {
  const result=await mvp.request('/session',{headers:{Cookie:c.req.header('Cookie') ?? ''}})
  const session=result.ok && await result.json()
  if (!session || session.role) return c.text('Войдите как партнёр',403)
  const rows=db.prepare('select body from preview_status_mail where recipient=? order by rowid desc limit 50').all(session.email)
  return c.text(rows.map(row=>row.body).join('\n\n────────\n\n') || 'Писем о смене статуса пока нет.')
})
if (process.platform === 'darwin') {
  const {registerImagePicker} = await import('./preview-image-picker.mjs')
  const {registerPosterDownloads} = await import('./preview-poster-downloads.mjs')
  const partnerSession = async c => {
    const response = await mvp.request('/session',{headers:{Cookie:c.req.header('Cookie') ?? ''}})
    return response.ok ? response.json() : null
  }
  registerImagePicker(app,partnerSession)
  registerPosterDownloads(app,partnerSession)
  const html = join(webRoot,'index.html')
  writeFileSync(html,readFileSync(html,'utf8').replace('</head>','<meta name="local-poster-picker" content="macos"><meta name="local-poster-downloads" content="macos"></head>'))
}
const autocomplete = createAutocomplete({saveRegistry:savePartnerRegistry})
const lookupRegistry = inn => autocomplete.request('/api/autocomplete/inn', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({inn}),
})
app.route('/api/v4/staff',createV4Staff({addresses:[],lookupRegistry,sendDocument},send))
app.route('/api/market',market)
app.route('/',autocomplete)
app.all('/api/*',c=>c.notFound())
app.use('*',serveStatic({root:webRoot}))
app.all('/assets/*',c=>c.notFound())
app.get('*',serveStatic({root:webRoot,path:'index.html'}))
serve({fetch:app.fetch,hostname:'127.0.0.1',port:5184},()=>console.log('Локальный кабинет http://127.0.0.1:5184/app/ · почта http://127.0.0.1:5184/local-inbox'))
