// Isolated loopback preview. Run after npm run build. No external email is sent.
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

if (existsSync('.env')) process.loadEnvFile('.env')
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
const mvp = createMvp(send,undefined,inbox)
app.route('/api/mvp',mvp)
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
app.route('/api/v4/staff',createV4Staff({addresses:[]},send))
app.route('/api/market',market)
app.route('/',createAutocomplete({token:()=>'local',request:async (_url,settings)=>{
  const {query} = JSON.parse(settings.body)
  const suggestions = query==='7707083893' ? [{value:'Кофейня на Садовой',data:{inn:query,name:{short_with_opf:'Кофейня на Садовой'},state:{status:'ACTIVE'},okved_type:'2014',okved:'56.10'}}] : []
  return Response.json({suggestions})
}}))
app.all('/api/*',c=>c.notFound())
app.use('*',serveStatic({root:webRoot}))
app.all('/assets/*',c=>c.notFound())
app.get('*',serveStatic({root:webRoot,path:'index.html'}))
serve({fetch:app.fetch,hostname:'127.0.0.1',port:5184},()=>console.log('Локальный кабинет http://127.0.0.1:5184/app/ · почта http://127.0.0.1:5184/local-inbox'))
