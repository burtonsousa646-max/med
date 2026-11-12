import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

const limit = 4 * 1024 * 1024
const signature = Buffer.from('89504e470d0a1a0a', 'hex')

function pngSize(bytes: Buffer) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  return width > 0 && width <= 1024 && height > 0 && height <= 1024 ? { width, height } : null
}

function runVision(command: string, bytes: Buffer, signal: AbortSignal) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile(command, [], { encoding: 'buffer', maxBuffer: limit, signal }, (error, output) => {
      if (error) reject(error)
      else resolve(output)
    })
    child.stdin?.on('error', reject)
    child.stdin?.end(bytes)
  })
}

async function runService(url: string, bytes: Buffer, signal: AbortSignal) {
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'offer.png')
  const response = await fetch(url, { method: 'POST', body: form, signal, redirect: 'error' })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('Cutout unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) return Buffer.concat(chunks)
      size += part.value.length
      if (size > limit) throw new Error('Cutout too large')
      chunks.push(part.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
}

type Processor = (bytes: Buffer, signal: AbortSignal) => Promise<Buffer>

export function createOfferCutout(processImage?: Processor) {
  let active = 0
  return new Hono().post('/offer-cutout', bodyLimit({
    maxSize: limit,
    onError: c => c.json({ message: 'Изображение слишком большое' }, 413),
  }), async c => {
    if (!processImage) return c.json({ message: 'Обработка изображений недоступна' }, 503)
    if (c.req.header('content-type')?.split(';')[0] !== 'image/png') return c.json({ message: 'Ожидается PNG' }, 415)
    const bytes = Buffer.from(await c.req.arrayBuffer())
    const size = pngSize(bytes)
    if (!size) return c.json({ message: 'Не удалось прочитать изображение' }, 422)
    if (active >= 2) return c.json({ message: 'Обработка занята. Попробуйте ещё раз' }, 429)
    active++
    try {
      const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(12_000)])
      const result = await processImage(bytes, signal)
      const processed = pngSize(result)
      if (!processed || processed.width !== size.width || processed.height !== size.height) {
        return c.json({ message: 'Не удалось выделить предмет' }, 422)
      }
      return c.body(new Uint8Array(result), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
    } catch {
      return c.json({ message: 'Не удалось выделить предмет' }, 422)
    } finally { active-- }
  })
}

const localVision = fileURLToPath(new URL('../node_modules/.cache/med-offer-cutout', import.meta.url))
const serviceUrl = process.env.OFFER_CUTOUT_URL
const command = process.env.NODE_ENV !== 'production' && process.platform === 'darwin' && existsSync(localVision) ? localVision : null
export const offerCutout = createOfferCutout(serviceUrl ? (bytes, signal) => runService(serviceUrl, bytes, signal)
  : command ? (bytes, signal) => runVision(command, bytes, signal) : undefined)
