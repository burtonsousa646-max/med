import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignAllowedStage, campaignDraftForServer, campaignStage, emptyCampaignDraft, isCampaignDraft, restoreCampaignDraft } from '../src/screens/campaign-draft.ts'

test('a custom offer background survives draft transport and rejects malformed colors', () => {
  const draft = emptyCampaignDraft()
  draft.offer.background = '#AbC123'
  assert.ok(isCampaignDraft(draft))
  assert.equal(campaignDraftForServer(draft).offer.background, '#AbC123')
  draft.offer.background = 'transparent'
  assert.equal(isCampaignDraft(draft), false)
})

function completedDraft() {
  const draft = { ...emptyCampaignDraft(), submitted: true }
  draft.business = { name: 'Кофейня', category: 'Кофе и завтраки', inn: '1234567894', phone: '+79000000001', city: 'Москва', website: '' }
  draft.confirmedInn = draft.business.inn
  draft.offerAccepted = true
  draft.addresses = ['Покровка, 12']
  draft.offer = { ...draft.offer, title: 'Загляните на завтрак', discount: '20' }
  draft.filled = true
  draft.stage = draft.reached = 5
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
    { ...draft, offerImage: { name: 'lost.png' } }, { ...draft, reached: 99 }, { ...draft, offerAccepted: 'yes' }]) {
    assert.equal(isCampaignDraft(broken), false)
  }
})

test('offer consent is required for lookup continuation and restored routes, including older drafts', () => {
  const draft = completedDraft()
  for (const accepted of [false, undefined]) {
    draft.offerAccepted = accepted
    assert.equal(isCampaignDraft(draft), true, 'Older drafts keep their data')
    assert.equal(campaignAllowedStage(draft), 0)
    for (const route of ['details', 'offer', 'audience', 'success', undefined]) assert.equal(campaignStage(route, draft), 0)
  }
  draft.offerAccepted = true
  assert.equal(campaignStage('success', draft), 5)
  assert.equal(emptyCampaignDraft().offerAccepted, false)
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
  assert.equal(campaignStage('success', { ...completedDraft(), submitted: undefined }), 4, 'Unsubmitted drafts can only get to email')
  assert.equal(campaignStage('email', { ...completedDraft(), stage: 3, reached: 3 }), 3, 'Direct navigation cannot skip audience')
  assert.equal(campaignStage('success', restoreCampaignDraft({ ...completedDraft(), stage: 4, reached: 4 })), 5, 'Old accepted drafts keep their success screen')
  assert.equal(campaignStage('success', completedDraft()), 5)
  assert.equal(campaignStage('preview', completedDraft()), 5)
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

test('targeting city is validated independently and legacy drafts still use the business city', () => {
  const draft = completedDraft()
  draft.audience[0] = 1
  assert.equal(campaignAllowedStage(draft), 4)
  assert.equal(campaignAllowedStage({ ...draft, audienceCity: '' }), 3)
  assert.equal(isCampaignDraft({ ...draft, audienceCity: 'а'.repeat(81) }), false)
  const targeted = { ...draft, audienceCity: 'Казань' }
  assert.equal(campaignAllowedStage(targeted), 4)
  const payload = campaignDraftForServer(targeted)
  assert.equal(payload.audienceCity, 'Казань')
  assert.equal(payload.business.city, 'Москва')
})

test('server receives the photo shown in the offer while the draft keeps the original', () => {
  const original = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })
  const cutout = new File(['cutout'], 'cutout.png', { type: 'image/png' })
  const draft = { ...completedDraft(), offerImage: original, offerCutout: cutout }
  const submitted = campaignDraftForServer(draft)
  assert.equal(submitted.offerImage, cutout)
  assert.equal('offerCutout' in submitted, false)
  assert.equal(draft.offerImage, original)
  assert.equal(campaignDraftForServer({ ...draft, keepOriginalImage: true }).offerImage, original)
  assert.equal(campaignDraftForServer({ ...draft, offer: { ...draft.offer, layout: 'photo' } }).offerImage, original)
})

test('ready artwork is required before continuing and reaches the server without photo processing or editor backups', () => {
  const draft = completedDraft()
  draft.offer.layout = 'artwork'
  assert.equal(isCampaignDraft(draft), true)
  assert.equal(campaignAllowedStage(draft), 2)
  const artwork = new File(['artwork'], 'offer.png', { type: 'image/png' })
  const photo = new File(['photo'], 'photo.png', { type: 'image/png' })
  const stored = { ...draft, offerImage: artwork, artworkImage: artwork, editorImage: photo, offerCutout: photo }
  assert.equal(campaignAllowedStage(stored), 4)
  const payload = campaignDraftForServer(stored)
  assert.equal(payload.offerImage, artwork)
  assert.equal(payload.offer.layout, 'artwork')
  for (const key of ['artworkImage', 'editorImage', 'offerCutout']) assert.equal(key in payload, false)
  assert.equal(stored.editorImage, photo)
})
