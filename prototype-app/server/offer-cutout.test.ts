import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOfferCutout } from './offer-cutout.ts'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yFYcAAAAASUVORK5CYII=', 'base64')
const call = (app: ReturnType<typeof createOfferCutout>, bytes: Buffer, type = 'image/png') => app.request('/offer-cutout', {
  method: 'POST', headers: { 'Content-Type': type }, body: new Uint8Array(bytes),
})

test('cutout route bounds PNGs and returns only a matching PNG', async () => {
  let count = 0
  const app = createOfferCutout(async input => { count++; return input })
  const huge = Buffer.from(png)
  huge.writeUInt32BE(4096, 16)
  assert.equal((await call(app, huge)).status, 422)
  assert.equal((await call(app, Buffer.from('invalid'))).status, 422)
  assert.equal((await call(app, png, 'image/jpeg')).status, 415)
  assert.equal(count, 0)
  const valid = await call(app, png)
  assert.equal(valid.status, 200)
  assert.equal(valid.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await valid.arrayBuffer()), png)
  const wrongSize = Buffer.from(png)
  wrongSize.writeUInt32BE(2, 16)
  assert.equal((await call(createOfferCutout(async () => wrongSize), png)).status, 422)
  assert.equal((await call(createOfferCutout(), png)).status, 503)
})
