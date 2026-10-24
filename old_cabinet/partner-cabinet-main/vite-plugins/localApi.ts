import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { assistantReply, generateOfferCopy, generateOfferIcon } from '../server/handlers.js'

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

type Handler = (body: any) => Promise<unknown>

function mountJsonRoute(server: { middlewares: { use: (path: string, fn: any) => void } }, path: string, handler: Handler) {
  server.middlewares.use(path, async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next()
    try {
      const body = await readJsonBody(req)
      const result = await handler(body)
      sendJson(res, 200, result)
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : 'Unknown error' })
    }
  })
}

/**
 * dev-only middleware, воспроизводящее api/*.ts из того же server/handlers.ts —
 * чтобы `npm run dev` работал без Vercel CLI. В production (Vercel) эти маршруты
 * обслуживают реальные serverless-функции из папки api/, этот плагин там не участвует.
 */
export function localApiPlugin(): Plugin {
  return {
    name: 'med-cabinet-local-api',
    configureServer(server) {
      mountJsonRoute(server, '/api/assistant', async (body) => ({ reply: await assistantReply(body.messages ?? [], body.page) }))
      mountJsonRoute(server, '/api/offers/generate-copy', (body) => generateOfferCopy(body))
      mountJsonRoute(server, '/api/icons/generate', async (body) => ({ dataUrl: await generateOfferIcon(body) }))
    },
  }
}
