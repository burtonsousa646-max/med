import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { emptyOffer } from '../shared/campaign-offer.ts'
import type { OfferAiInput } from '../shared/offer-ai.ts'
import { createOfferAi, offerAnswer } from './offer-ai.ts'

const base = {
  mode: 'manual', name: 'Автоплюс', category: 'Шиномонтаж',
  offer: { ...emptyOffer, title: 'Скидка 20% на замену резины', discount: '20', promo: 'TEST_20' },
  request: 'Сделай скидку 25%', hasImage: false, hasLogo: false,
} satisfies OfferAiInput
const replayFile = fileURLToPath(new URL('../scripts/fixtures/offer-ai-codex.json', import.meta.url))
const replay = createOfferAi({ provider: 'codex-replay', replayFile })
const call = (app: ReturnType<typeof createOfferAi>, input: OfferAiInput) => app.request('/offer-ai', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
const answer = {
  status: 'draft', patch: { discount: '25', title: 'Скидка 25% на замену резины' }, options: [], question: null,
  visual: { action: 'keep', assetId: null, prompt: null }, logoAssetId: null,
}

test('a capped discount cannot become a fixed discount in the model response', () => {
  const input = { ...base, offer: { ...emptyOffer, title: 'На замену резины' }, request: 'Скидка до 25% на замену резины' }
  assert.equal(offerAnswer(answer, input), null)
  assert.ok(offerAnswer({ ...answer, patch: { title: 'Скидка до 25% на замену резины' } }, input))
})

test('Codex replay uses the same validation for first draft, ideas, revision and clarification', async () => {
  const auto = { ...base, mode: 'auto', request: '', offer: { ...emptyOffer, title: 'Шиномонтаж' } } as const
  const result = await (await call(replay, auto)).json()
  assert.equal(result.source, 'codex-replay')
  assert.deepEqual(result.answer.patch, { title: 'Сезонная замена шин' })
  const ideas = await (await call(replay, { ...auto, category: 'Кофейня', offer: { ...emptyOffer, title: 'Меню кофейни' } })).json()
  assert.equal(ideas.answer.status, 'ideas')
  assert.equal(ideas.answer.options.length, 3)
  assert.deepEqual(ideas.answer.patch, {})
  const manual = await (await call(replay, base)).json()
  assert.deepEqual(manual.answer.patch, answer.patch)
  const clarify = await (await call(replay, {
    ...base, request: 'Добавь подарок', offer: { ...emptyOffer, title: 'Сезонная замена шин' },
  })).json()
  assert.equal(clarify.answer.status, 'needs_input')
  assert.deepEqual(clarify.answer.patch, {})
})

test('validator rejects unrequested discounts, rewritten promo codes and modifications to auto locks', () => {
  assert.equal(offerAnswer({ ...answer, patch: { discount: '40' } }, base), null)
  assert.equal(offerAnswer({ ...answer, patch: { promo: 'TEST_25' } }, base), null)
  assert.equal(offerAnswer({ ...answer, patch: { title: 'Лучшая скидка' } }, { ...base, mode: 'auto', lockedFields: ['title'] }), null)
  assert.equal(offerAnswer(answer, { ...base, mode: 'auto' }), null)
  assert.equal(offerAnswer({ ...answer, status: 'needs_input', question: 'Уточните услугу' }, base), null)
  assert.equal(offerAnswer({ ...answer, patch: { promo: 'Demo_25' } }, { ...base, request: 'Промокод Demo_25' })?.patch.promo, 'Demo_25')
})

test('production transport sends the full prompt, keeps existing codes out of the model payload and parses output', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(String(init.body))
    assert.equal(body.model, 'test-model')
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.ok(body.instructions.includes('## Как удалить фон'))
    const context = JSON.parse(body.input)
    assert.equal(context.hasPromo, true)
    assert.equal(context.offer.promo, undefined)
    assert.equal(context.inn, undefined)
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })
  })
  const api = createOfferAi({ provider: 'openai', model: 'test-model', key: 'fake-test-key' })
  const result = await call(api, base)
  assert.equal(result.status, 200)
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.deepEqual(await result.json(), { source: 'api', answer })
  fetchMock.mock.mockImplementationOnce(async () => new Response(null, { status: 429 }))
  assert.equal((await call(api, base)).status, 502)
})

test('no configuration stays local and production cannot enable replay', async () => {
  assert.deepEqual(await (await call(createOfferAi({}), base)).json(), { source: 'disabled' })
  assert.equal((await call(createOfferAi({ provider: 'codex-replay', replayFile, production: true }), base)).status, 503)
  assert.equal((await call(createOfferAi({ provider: 'openai' }), base)).status, 503)
})
