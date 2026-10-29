// API платформы: /api/auth — вход, /api/cabinet — партнёр, /api/admin — сотрудники билайна,
// /api/public — поверхности и сервер партнёра, /api/hooks — внешние системы.
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { sql } from './db.ts'
import { checkPorts, portStatus } from './integrations/index.ts'
import { hooksRouter } from './integrations/hooks.ts'
import { auth, errorHandler, partner, staff, stubPages, type Env } from './modules/identity.ts'
import { company, onboarding } from './modules/partners.ts'
import './modules.ts'

export const app = new Hono<Env>().basePath('/api')
app.onError(errorHandler)

app.get('/health', async c => {
  await sql`select 1`
  return c.json({ ok: true, ports: portStatus() })
})
app.route('/auth', auth)
app.route('/auth', onboarding)
app.route('/stub', stubPages)
app.route('/hooks', hooksRouter)

export const cabinet = new Hono<Env>()
cabinet.use(partner())
cabinet.route('/company', company)
app.route('/cabinet', cabinet)

export const admin = new Hono<Env>()
admin.use(staff())
admin.get('/ports', c => c.json(portStatus()))
app.route('/admin', admin)

if (import.meta.main) {
  checkPorts()
  const port = Number(process.env.API_PORT ?? 8788)
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port })
  console.log(`api http://127.0.0.1:${port}/api`)
}
