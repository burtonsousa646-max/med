import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignAllowedStage, campaignStage, emptyCampaignDraft, isCampaignDraft } from '../src/screens/campaign-draft.ts'

function completedDraft() {
  const draft = emptyCampaignDraft()
  draft.business = { name: 'Кофейня', category: 'Кофе и завтраки', inn: '1234567894', phone: '+79000000001', city: 'Москва', website: '' }
  draft.confirmedInn = draft.business.inn
  draft.addresses = ['Покровка, 12']
  draft.offer = { ...draft.offer, title: 'Загляните на завтрак', discount: '20' }
  draft.filled = true
  draft.stage = draft.reached = 4
  return draft
}

test('stored drafts validate before restoring fields and files', () => {
  const draft = emptyCampaignDraft()
  assert.equal(isCampaignDraft(draft), true)
  draft.offerImage = new File(['image'], 'offer.png', { type: 'image/png' })
  draft.offer.tone = 'magenta'
  assert.equal(isCampaignDraft(draft), true)
  for (const broken of [null, {}, { ...draft, business: null }, { ...draft, stage: 4 },
    { ...draft, audience: [0, 0, 0, 0, 3] }, { ...draft, addresses: [] },
    { ...draft, offer: { ...draft.offer, tone: 'unknown' } },
    { ...draft, offerImage: { name: 'lost.png' } }, { ...draft, reached: 99 }]) {
    assert.equal(isCampaignDraft(broken), false)
  }
})

test('URLs restore a visited step and cannot skip unfinished setup', () => {
  const draft = { ...completedDraft(), stage: 2, reached: 3 }
  assert.equal(campaignStage('preview', emptyCampaignDraft()), 0)
  assert.equal(campaignStage('audience', draft), 3)
  assert.equal(campaignStage('business', draft), 0)
  assert.equal(campaignStage(undefined, draft), 2)
  assert.equal(campaignStage('unknown', draft), 2)
})

test('success preserves completed drafts and legacy URLs without skipping setup', () => {
  assert.equal(campaignStage('success', { ...completedDraft(), stage: 3, reached: 3 }), 3)
  assert.equal(campaignStage('success', completedDraft()), 4)
  assert.equal(campaignStage('preview', completedDraft()), 4)
  assert.equal(isCampaignDraft({ ...emptyCampaignDraft(), stage: 4, reached: 4 }), true)
})

test('editing a completed offer blocks direct and restored audience and success routes', () => {
  for (const patch of [{ title: '' }, { title: '1234' }, { title: 'a'.repeat(91) }, { discount: '100' }, { discount: '-1' }, { discount: '1.5' }, { promo: '!' }, { until: '2020-01-01' }, { until: '2099-02-31' }]) {
    const draft = completedDraft()
    Object.assign(draft.offer, patch)
    for (const route of ['audience', 'success', 'preview', undefined]) assert.equal(campaignStage(route, draft), 2)
    assert.equal(campaignAllowedStage(draft), 2)
  }
  const draft = completedDraft()
  draft.offer.discount = ''
  assert.equal(campaignAllowedStage(draft), 4, 'A title can advertise a non-discount offer')
  draft.offer.tone = 'green'
  assert.equal(isCampaignDraft(draft), true)
  assert.equal(draft.offer.tone, 'green')
})

test('all previous steps must stay valid before finalizing', () => {
  const draft = completedDraft()
  draft.business.inn = '7707083893'
  assert.equal(campaignAllowedStage(draft), 0, 'A changed company needs confirmation')
  draft.business.inn = draft.confirmedInn
  draft.addresses.push('покровка, 12 ')
  assert.equal(campaignStage('success', draft), 1, 'Duplicate addresses are invalid')
  draft.online = true
  draft.business.city = ''
  draft.audience[0] = 1
  assert.equal(campaignStage('success', draft), 3, 'City targeting needs a city')
  draft.audience[0] = 2
  assert.equal(campaignAllowedStage(draft), 4, 'Online nationwide setup needs no address')
})
