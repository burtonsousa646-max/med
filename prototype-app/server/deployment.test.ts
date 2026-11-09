import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_PATH = ':memory:'
delete process.env.ANTHROPIC_API_KEY
const { app } = await import('./index.ts')
const { db } = await import('./db.ts')

test('health checks query SQLite without creating demo companies or cookies', async () => {
  const before = db.prepare('select count(*) n from companies').get()!.n
  const response = await app.request('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(db.prepare('select count(*) n from companies').get()!.n, before)
})

test('HTTPS deployment can mark session cookies Secure without breaking local HTTP', async () => {
  const original = process.env.COOKIE_SECURE
  try {
    process.env.COOKIE_SECURE = 'true'
    const secure = await app.request('/api/session')
    assert.match(secure.headers.get('set-cookie')!, /; Secure/)
    assert.match(secure.headers.get('set-cookie')!, /; HttpOnly/)
    process.env.COOKIE_SECURE = 'false'
    const local = await app.request('/api/session')
    assert.doesNotMatch(local.headers.get('set-cookie')!, /; Secure/)
  } finally {
    if (original === undefined) delete process.env.COOKIE_SECURE
    else process.env.COOKIE_SECURE = original
  }
})
