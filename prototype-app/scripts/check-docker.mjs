import assert from 'node:assert/strict'

const base = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/$/, '')
const request = path => fetch(new URL(path, base + '/'), { signal: AbortSignal.timeout(10_000) })
const health = await request('/api/health')
assert.equal(health.status, 200)
assert.deepEqual(await health.json(), { status: 'ok' })
assert.equal(health.headers.get('set-cookie'), null, 'Health checks must not create a demo session')

const index = await request('/')
assert.equal(index.status, 200)
assert.match(index.headers.get('content-type'), /text\/html/)
assert.match(index.headers.get('cache-control'), /no-cache/)
assert.match(index.headers.get('x-robots-tag'), /noindex/)
const html = await index.text()
const script = html.match(/<script[^>]*src="([^"]+)"/)?.[1]
assert.ok(script, 'Production HTML must reference its built entrypoint')
assert.ok(script.startsWith('/assets/'), 'Deep links need an origin-relative built entrypoint')
for (const path of ['/market/', '/app/', '/app/campaigns/new']) {
  const entry = await request(path)
  assert.equal(entry.status,200,path)
  assert.ok((await entry.text()).includes(script),path)
}
const market = await request('/api/market/offers')
assert.equal(market.status,200)
assert.ok(Array.isArray((await market.json()).items))
assert.equal((await request('/api/mvp/session')).status,401)
const asset = await request(script)
assert.equal(asset.status, 200)
assert.match(asset.headers.get('cache-control'), /immutable/)
assert.match(asset.headers.get('content-type'), /javascript/)

for (const path of ['/assets/missing-file.js', '/img/missing-file.png']) {
  assert.equal((await request(path)).status, 404, `Missing static files must not return the SPA: ${path}`)
}
const missingApi = await request('/api/missing-route')
assert.equal(missingApi.status, 404)
assert.match(missingApi.headers.get('content-type'), /application\/json/)
console.log('PASS: API/SQLite health, production HTML and JS, cache headers, noindex, missing static/API routes.')
