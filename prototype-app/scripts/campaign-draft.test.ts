import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignStage, emptyCampaignDraft, isCampaignDraft } from '../src/screens/campaign-draft.ts'

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
  assert.equal(campaignStage('preview', { stage: 0, reached: 0 }), 0)
  assert.equal(campaignStage('audience', { stage: 2, reached: 3 }), 3)
  assert.equal(campaignStage('business', { stage: 2, reached: 3 }), 0)
  assert.equal(campaignStage(undefined, { stage: 2, reached: 3 }), 2)
  assert.equal(campaignStage('unknown', { stage: 2, reached: 3 }), 2)
})
