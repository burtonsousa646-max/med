// API платформы: /api/auth — вход, /api/cabinet — партнёр, /api/admin — сотрудники билайна,
// /api/public — поверхности и сервер партнёра, /api/hooks — внешние системы.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { sql } from './db.ts'
import { checkPorts, portStatus } from './integrations/index.ts'
import { hooksRouter } from './integrations/hooks.ts'
import { auth, errorHandler, partner, staff, stubPages, type Env } from './modules/identity.ts'
import { company, onboarding } from './modules/partners.ts'
import { billing, billingAdmin, payStub } from './modules/billing.ts'
import { campaigns } from './modules/campaigns.ts'
import { moderationAdmin } from './modules/moderation.ts'
import { documents, documentsAdmin } from './modules/documents.ts'
import { servingPublic } from './modules/serving.ts'
import { trackingCabinet, trackingPublic } from './modules/tracking.ts'
import { settlementAdmin } from './modules/settlement.ts'
import { reporting } from './modules/reporting.ts'
import { backoffice } from './modules/backoffice.ts'
import { port } from './integrations/index.ts'
import './modules.ts'
import { headers, limitBody, rateLimit } from './security.ts'

export const app = new Hono<Env>().basePath('/api')
app.onError(errorHandler)
app.use(headers, limitBody)
// вход и коды — против перебора; публичный API — против залпов с одного адреса (поверхности ходят со своих серверов, лимит щедрый)
app.use('/auth/email/*', rateLimit('otp', 10))
app.use('/auth/start', rateLimit('login', 30))
app.use('/stub/*', rateLimit('stub', 60))
app.use('/public/act/*', rateLimit('act', 30))
app.use('/public/postback', rateLimit('postback', 1200))
app.use('/public/*', rateLimit('public', 20000))

app.get('/health', async c => {
  await sql`select 1`
  return c.json({ ok: true, ports: portStatus() })
})
app.route('/auth', auth)
app.route('/auth', onboarding)
app.route('/stub', stubPages)
app.route('/stub', payStub)
app.route('/hooks', hooksRouter)
// Публичный API зовут поверхности с чужих доменов (embed.js на beeline.ru); cookie здесь не используются
app.use('/public/*', cors({ origin: '*', allowHeaders: ['content-type', 'x-surface-key'] }))
app.route('/public', servingPublic)
app.route('/public', trackingPublic)

// Файлы креативов публичны: их показывают абонентам. Документы отдаются только через кабинет.
app.get('/files/:key{.+}', async c => {
  const key = c.req.param('key')
  const f = key.startsWith('creatives/') && !key.includes('..') ? await port('storage').get(key) : null
  if (!f) return c.json({ message: 'нет такого файла' }, 404)
  return c.body(f.body as never, 200, { 'content-type': f.contentType, 'cache-control': 'public, max-age=31536000, immutable' })
})

export const cabinet = new Hono<Env>()
cabinet.use(partner())
cabinet.route('/company', company)
cabinet.route('/', billing)
cabinet.route('/', campaigns)
cabinet.route('/', documents)
cabinet.route('/', trackingCabinet)
cabinet.route('/', reporting)
app.route('/cabinet', cabinet)

export const admin = new Hono<Env>()
admin.use(staff())
admin.get('/ports', c => c.json(portStatus()))
admin.route('/', billingAdmin)
admin.route('/', moderationAdmin)
admin.route('/', documentsAdmin)
admin.route('/', settlementAdmin)
admin.route('/', backoffice)
app.route('/admin', admin)

if (import.meta.main) {
  checkPorts()
  const port = Number(process.env.API_PORT ?? 8788)
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port })
  console.log(`api http://127.0.0.1:${port}/api`)
}
