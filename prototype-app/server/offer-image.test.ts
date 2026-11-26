import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createOfferImage } from './offer-image.ts'
import { isOfferImageInput } from '../shared/offer-image.ts'

const input = { category: 'Кофе и завтраки', title: 'На первый заказ кофе', variant: 0 }
const png = readFileSync(new URL('../public/img/offer-variants/coffee-ivory.png', import.meta.url))
function call(app: ReturnType<typeof createOfferImage>, value: unknown = input, reference?: File) {
  const form = new FormData()
  form.set('input', JSON.stringify(value))
  if (reference) form.set('image', reference)
  return app.request('/offer-image', { method: 'POST', body: form })
}

test('local catalog contains distinct, usable PNGs and cycles only through relevant creatives', async () => {
  const app = createOfferImage({ provider: 'demo' })
  const catalog = JSON.parse(readFileSync(new URL('../public/img/offer-variants/catalog.json', import.meta.url), 'utf8')) as Record<string, { categories: string[]; files: string[] }>
  assert.ok(Object.keys(catalog).length > 0)
  for (const group of Object.values(catalog)) {
    assert.ok(group.categories.length && group.files.length >= 3)
    const hashes = new Set<string>()
    const sample = { ...input, category: group.categories[0] }
    for (let variant = 0; variant < group.files.length; variant++) {
      const response = await call(app, { ...sample, variant })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('x-offer-image-source'), 'demo')
      const bytes = Buffer.from(await response.arrayBuffer())
      assert.ok(bytes.readUInt32BE(16) >= 600 && bytes.readUInt32BE(20) >= 400)
      assert.equal(bytes[25], 6, 'RGBA output keeps an alpha channel')
      hashes.add(createHash('sha256').update(bytes).digest('hex'))
    }
    assert.equal(hashes.size, group.files.length)
    const first = await call(app, sample)
    const wrapped = await call(app, { ...sample, variant: group.files.length })
    assert.deepEqual(await first.arrayBuffer(), await wrapped.arrayBuffer())
  }
  assert.equal((await call(app, { ...input, category: 'Неподготовленнаясфера123456789' })).status, 409, 'No unrelated coffee for another business')
  assert.equal((await call(createOfferImage({ provider: 'demo', production: true }))).status, 503, 'Demo is disabled in production')
})

test('image generation validates input and references before spending a request', async () => {
  const app = createOfferImage({ provider: 'openai', key: 'test-key', model: 'gpt-image-2.5-flare' })
  for (const value of [null, {}, { ...input, variant: -1 }, { ...input, variant: 1.5 }, { ...input, title: 'x'.repeat(91) }, { ...input, category: '' }]) {
    assert.equal(isOfferImageInput(value), false)
    assert.equal((await call(app, value)).status, 400)
  }
  assert.equal((await call(app, input, new File(['invalid'], 'image.png', { type: 'image/png' }))).status, 400)
  assert.equal((await call(createOfferImage({ provider: 'openai' }))).status, 503)
  assert.equal((await app.request('/offer-image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 415)
})

test('live generation and reference editing use the real provider contract without leaking credentials or terms', async t => {
  const requests: { url: string; body: unknown }[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-key')
    const body = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(String(init.body))
    requests.push({ url, body })
    return Response.json({ data: [{ b64_json: png.toString('base64') }] })
  })
  const app = createOfferImage({ provider: 'openai', key: 'test-key', model: 'gpt-image-2.5-flare', production: true })
  const response = await call(app)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-offer-image-source'), 'api')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  assert.equal(requests[0].url, 'https://api.openai.com/v1/images/generations')
  const body = requests[0].body as Record<string, string>
  assert.equal(body.background, 'transparent')
  assert.equal(body.model, 'gpt-image-2.5-flare')
  assert.equal(body.output_format, 'png')
  assert.ok(body.prompt.includes(input.title))
  assert.equal((await call(app, input, new File([new Uint8Array(png)], 'original.png', { type: 'image/png' }))).status, 200)
  assert.equal(requests[1].url, 'https://api.openai.com/v1/images/edits')
  assert.ok((requests[1].body as Record<string, unknown>)['image[]'] instanceof File)
})

test('provider errors and invalid images leave an actionable error; concurrency is bounded', async t => {
  const app = createOfferImage({ provider: 'openai', key: 'test-key', model: 'gpt-image-2.5-flare' })
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('sensitive upstream error') })
  const failed = await call(app)
  assert.equal(failed.status, 502)
  assert.equal((await failed.text()).includes('sensitive'), false)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ b64_json: 'bm90IGFuIGltYWdl' }] }))
  assert.equal((await call(app)).status, 502)
  t.mock.restoreAll()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered = 0
  t.mock.method(globalThis, 'fetch', async () => { entered++; await gate; return Response.json({ data: [{ b64_json: png.toString('base64') }] }) })
  const first = call(app), second = call(app)
  for (let attempt = 0; entered < 2 && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(entered, 2)
  assert.equal((await call(app)).status, 429)
  release()
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
})
