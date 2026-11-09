import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acquisitionTags, analytics, createFunnelTracker, safeParams, type EventParams } from '../src/analytics.ts'

test('analytics accepts only fixed categories and bounded metrics, never form data', () => {
  const input = {
    step: 'offer', source: 'hero', has_image: true, duration_ms: Infinity,
    phone: '+79000000001', inn: '1234567894', address: 'Покровка, 12', prompt: 'Мой текст',
    field: 'Мой текст', reason: 'Покровка, 12', toString: 'not-a-function', choice: 1234567894,
  } as unknown as EventParams
  assert.deepEqual(safeParams(input), { product: 'campaign_v4', schema: 1, step: 'offer', source: 'hero', has_image: true, choice: 2 })
  assert.deepEqual(safeParams({ duration_ms: 250.6, address_count: -1, error_count: 999 }), {
    product: 'campaign_v4', schema: 1, duration_ms: 251, address_count: 0, error_count: 100,
  })
})

test('acquisition URLs preserve allowed campaign tags and discard arbitrary query values', () => {
  const tags = acquisitionTags('?utm_source=yandex&utm_medium=cpc&utm_campaign=кофе&yclid=12345&phone=79000000001&token=secret&utm_term=user@example.com')
  const query = new URLSearchParams(tags)
  assert.equal(query.get('utm_source'), 'yandex')
  assert.equal(query.get('utm_campaign'), 'кофе')
  assert.equal(query.get('yclid'), '12345')
  assert.equal(query.has('phone'), false)
  assert.equal(query.has('token'), false)
  assert.equal(query.has('utm_term'), false)
})

test('SPA views deduplicate StrictMode and rerenders but count genuine returns', () => {
  const calls: unknown[][] = []
  let clock = 0
  const tracker = createFunnelTracker((...args) => calls.push(args), () => clock)
  tracker.event('v4_draft_restore', { result: 'empty' })
  assert.equal(calls.length, 0, 'Events wait for a first valid page hit')
  assert.equal(tracker.view('/v4/create/business'), true)
  assert.equal(tracker.view('/v4/create/business'), false)
  assert.deepEqual(calls.map(c => c[1]), ['/#/v4/create/business', 'v4_business_view', 'v4_draft_restore'])
  clock = 12500
  tracker.view('/v4/create/details')
  const leave = calls.find(c => c[1] === 'v4_step_leave')!
  assert.equal((leave[2] as Record<string, unknown>).duration_ms, 12500)
  tracker.view('/v4/create/business')
  assert.equal(calls.filter(c => c[1] === 'v4_business_view').length, 2)
  tracker.view(null)
  assert.equal(tracker.view('/v4/create/business'), true)
})

test('success views and reloads never generate completion conversions', () => {
  const calls: unknown[][] = []
  for (let reload = 0; reload < 2; reload++) {
    const tracker = createFunnelTracker((...args) => calls.push(args))
    tracker.view('/v4/create/success')
    tracker.view('/v4/create/success')
  }
  assert.equal(calls.filter(c => c[1] === 'v4_success_view').length, 2)
  assert.equal(calls.filter(c => c[1] === 'v4_setup_complete').length, 0)
})

test('blocked or unavailable analytics cannot break the product', () => {
  const tracker = createFunnelTracker(() => { throw new Error('Blocked') })
  assert.doesNotThrow(() => {
    tracker.view('/v4')
    tracker.event('v4_cta_click', { source: 'hero' })
    tracker.view('/v4/create/business')
    analytics.view('/v4') // No configured counter in Node: no browser globals required.
  })
})
