import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isOfferImageInput, type OfferImageInput } from '../shared/offer-image.ts'

const maxImage = 5 * 1024 * 1024
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const publicRoot = new URL('../public/img/offer-variants/', import.meta.url)
const prompt = readFileSync(new URL('../docs/offer-image-prompt.md', import.meta.url), 'utf8').split('\n---\n')[1].trim()
const directions = ['Новый ракурс и выразительный силуэт.', 'Другая предметная композиция, мягкий боковой свет.', 'Более лаконичная композиция, другой ракурс и материалы.']
type Catalog = Record<string, { categories: string[]; files: string[] }>

export function validOfferPng(bytes: Buffer) {
  if (bytes.length < 33 || bytes.length > maxImage || !bytes.subarray(0, 8).equals(pngSignature) || bytes.toString('ascii', 12, 16) !== 'IHDR') return false
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  return width >= 128 && height >= 128 && width <= 2048 && height <= 2048
}

async function providerImage(input: OfferImageInput, reference: File | null, key: string, model: string, signal: AbortSignal) {
  const fields = { model, prompt: prompt + '\nНаправление: ' + directions[input.variant % directions.length] + '\nДанные оффера: ' + JSON.stringify({ category: input.category, title: input.title }), n: 1, size: '1024x1024', background: 'transparent', output_format: 'png', quality: 'medium' }
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  let body: FormData | string
  if (reference) {
    body = new FormData()
    for (const [name, value] of Object.entries(fields)) body.set(name, String(value))
    body.set('image[]', reference, 'reference.png')
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(fields)
  }
  const response = await fetch('https://api.openai.com/v1/images/' + (reference ? 'edits' : 'generations'), { method: 'POST', headers, body, signal })
  if (!response.ok || !response.body) throw new Error('Image provider unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.length
      if (total > 8 * 1024 * 1024) throw new Error('Image response too large')
      chunks.push(part.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { data?: { b64_json?: string }[] }
  const encoded = result.data?.[0]?.b64_json
  if (!encoded || !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid image response')
  return Buffer.from(encoded, 'base64')
}

type Config = { provider?: string; key?: string; model?: string; production?: boolean }
export function createOfferImage(config: Config) {
  let active = 0, requests = 0, day = ''
  return new Hono().post('/offer-image', bodyLimit({ maxSize: maxImage + 4096, onError: c => c.json({ message: 'Изображение слишком большое' }, 413) }), async c => {
    c.header('Cache-Control', 'no-store')
    if (!c.req.header('content-type')?.startsWith('multipart/form-data;')) return c.json({ message: 'Ожидаются данные оффера' }, 415)
    let input: OfferImageInput
    let reference: File | null
    try {
      const form = await c.req.formData()
      const raw = form.get('input')
      if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Invalid input')
      const parsed: unknown = JSON.parse(raw)
      if (!isOfferImageInput(parsed)) throw new Error('Invalid input')
      input = parsed
      const image = form.get('image')
      if (image !== null && (!(image instanceof File) || image.type !== 'image/png' || !validOfferPng(Buffer.from(await image.arrayBuffer())))) throw new Error('Invalid reference')
      reference = image as File | null
    } catch { return c.json({ message: 'Проверьте сферу бизнеса, заголовок и изображение' }, 400) }

    if (config.provider === 'demo' && !config.production) {
      try {
        const catalog = JSON.parse(readFileSync(new URL('catalog.json', publicRoot), 'utf8')) as Catalog
        const group = Object.values(catalog).find(group => group.categories.some(word => input.category.toLowerCase().includes(word.toLowerCase())))
        if (!group?.files.length) return c.json({ message: 'Для этой сферы ещё нет демо-вариантов. Загрузите своё фото или подключите генерацию' }, 409)
        const file = group.files[input.variant % group.files.length]
        if (!/^[a-z0-9][a-z0-9-]*\.png$/.test(file)) throw new Error('Invalid catalog path')
        const bytes = readFileSync(new URL(file, publicRoot))
        if (!validOfferPng(bytes)) throw new Error('Invalid demo asset')
        c.header('X-Offer-Image-Source', 'demo')
        return c.body(new Uint8Array(bytes), 200, { 'Content-Type': 'image/png' })
      } catch { return c.json({ message: 'Не удалось открыть демо-креатив. Попробуйте ещё раз' }, 503) }
    }
    if (config.provider !== 'openai' || !config.key || !config.model) return c.json({ message: 'Генерация изображений ещё не подключена. Загрузите своё фото' }, 503)
    const today = new Date().toISOString().slice(0, 10)
    if (day !== today) { day = today; requests = 0 }
    // shortcut: process-local budget; move to shared storage before running multiple API instances.
    if (active >= 2 || requests >= 30) return c.json({ message: 'Генерация занята или достигнут дневной лимит. Попробуйте позже' }, 429)
    active++; requests++
    try {
      const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(120_000)])
      const bytes = await providerImage(input, reference, config.key, config.model, signal)
      if (!validOfferPng(bytes)) throw new Error('Invalid generated asset')
      c.header('X-Offer-Image-Source', 'api')
      return c.body(new Uint8Array(bytes), 200, { 'Content-Type': 'image/png' })
    } catch { return c.json({ message: 'Не удалось создать изображение. Текущий креатив сохранён. Попробуйте ещё раз' }, 502) }
    finally { active-- }
  })
}

function keyFromFile() {
  try { return process.env.OPENAI_API_KEY_FILE ? readFileSync(process.env.OPENAI_API_KEY_FILE, 'utf8').trim() : undefined }
  catch { return undefined }
}
export const offerImage = createOfferImage({
  provider: process.env.OFFER_IMAGE_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'off' : 'demo'),
  key: process.env.OPENAI_API_KEY || keyFromFile(), model: process.env.OFFER_IMAGE_MODEL ?? 'gpt-image-2.5-flare',
  production: process.env.NODE_ENV === 'production',
})
