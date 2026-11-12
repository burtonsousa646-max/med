import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyOffer, offerErrors, reviseOffer } from '../src/screens/offer-assistant-demo.ts'
import { nextOfferDesign, offerCreativeCopy, offerDisplayTitle, resolveOfferLayout, withOfferDiscount } from '../shared/campaign-offer.ts'

const draft = { ...emptyOffer, title: 'Мой текст', discount: '20', promo: 'ЗЕРНО', until: '2026-12-01' }
test('another design visibly changes the card without changing agreed terms or restoring a removed image', () => {
  for (const layout of [undefined, 'split', 'photo', 'text'] as const) {
    const current = { ...draft, layout }
    const next = nextOfferDesign(current, true)
    assert.notEqual(next.tone, current.tone)
    const { tone, layout: changedLayout, ...terms } = next
    const { tone: originalTone, ...originalTerms } = draft
    assert.deepEqual(terms, originalTerms)
    if (layout === 'text') assert.equal(changedLayout, 'text')
  }
  assert.equal(nextOfferDesign(draft, false).layout, 'text')
})
test('color and size preserve manually entered offer fields', () => {
  const result = reviseOffer('Сделай фон синим и увеличь чашку', draft)!
  assert.deepEqual(result.offer, { ...draft, tone: 'blue', zoom: true })
  assert.equal(draft.tone, 'violet')
})
test('gift and discount stay mutually consistent', () => {
  assert.equal(reviseOffer('Сделай 1 + 1', draft)?.offer.title, draft.title)
  const gift = reviseOffer('Второй кофе в подарок', draft)!.offer
  assert.equal(gift.gift, true); assert.equal(gift.discount, '')
  const discount = reviseOffer('Сделай скидку 25% и фон зелёным', gift)!.offer
  assert.equal(discount.gift, false); assert.equal(discount.discount, '25')
  assert.equal(discount.title, 'На кофе')
  assert.equal(discount.promo, 'ЗЕРНО')
})
test('invalid and unsupported commands leave draft unchanged', () => {
  for (const request of ['скидка 120%', 'скидка 0%', 'Скидка до 20%', 'нарисуй слона', '']) assert.equal(reviseOffer(request, draft), null)
})
test('promo and quoted title can be changed', () => {
  const result = reviseOffer('Промокод КОФЕ и заголовок «Заходите на завтрак»', draft)!.offer
  assert.equal(result.promo, 'КОФЕ'); assert.equal(result.title, 'Заходите на завтрак')
})

test('offer validation accepts optional empty terms and rejects invalid dates and discounts', () => {
  assert.deepEqual(offerErrors({ ...emptyOffer, title: 'Загляните на завтрак' }), { title: '', promo: '', discount: '', until: '' })
  assert.ok(offerErrors(emptyOffer).title)
  for (const until of ['2099-02-31', 'not-a-date', '2000-01-01']) assert.ok(offerErrors({ ...draft, until }).until)
  assert.equal(offerErrors({ ...draft, until: '2099-12-31', discount: '99' }).until, '')
  for (const discount of ['0', '100', '2.5', '-20']) assert.ok(offerErrors({ ...draft, discount }).discount)
})

test('discount edits keep the offer scope and show the number once', () => {
  const tire = { ...draft, title: 'Скидка 20% на замену резины' }
  const revised = reviseOffer('Скидка 25%', tire)!.offer
  assert.equal(revised.title, 'Скидка 25% на замену резины')
  assert.equal(offerDisplayTitle(revised), 'На замену резины')
  assert.equal(withOfferDiscount(tire, '').title, 'на замену резины')
  assert.equal(reviseOffer('Промокод Шина_20', tire)!.offer.promo, 'Шина_20')
  assert.equal(reviseOffer('Убери промокод и сделай фон синим', tire)!.offer.promo, '')
  assert.ok(offerErrors({ ...tire, discount: '25' }).discount)
})

test('automatic layout follows the reference and manual layout takes precedence', () => {
  assert.equal(resolveOfferLayout(undefined, true), 'split')
  assert.equal(resolveOfferLayout('photo', true), 'photo')
  assert.equal(resolveOfferLayout('text', true), 'text')
  assert.equal(resolveOfferLayout('photo', false), 'text')
})

test('leading prices and loyalty points have their own line', () => {
  assert.deepEqual(offerCreativeCopy({ ...emptyOffer, title: '1 490 ₽ маникюр с покрытием' }), {
    benefit: '1 490 ₽', title: 'маникюр с покрытием',
  })
  assert.deepEqual(offerCreativeCopy({ ...emptyOffer, title: '300 баллов за покупку' }), {
    benefit: '300', title: 'баллов за покупку',
  })
  assert.deepEqual(offerCreativeCopy({ ...emptyOffer, title: '2 часа работы' }), {
    benefit: '', title: '2 часа работы',
  })
})
