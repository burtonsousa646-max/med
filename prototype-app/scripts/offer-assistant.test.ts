import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyOffer, offerErrors, reviseOffer } from '../src/screens/offer-assistant-demo.ts'

const draft = { ...emptyOffer, title: 'Мой текст', discount: '20', promo: 'ЗЕРНО', until: '2026-12-01' }
test('color and size preserve manually entered offer fields', () => {
  const result = reviseOffer('Сделай фон синим и увеличь чашку', draft)!
  assert.deepEqual(result.offer, { ...draft, tone: 'blue', zoom: true })
  assert.equal(draft.tone, 'violet')
})
test('gift and discount stay mutually consistent', () => {
  assert.equal(reviseOffer('Сделай 1 + 1', draft)?.offer.title, 'Второй в подарок')
  const gift = reviseOffer('Второй кофе в подарок', draft)!.offer
  assert.equal(gift.gift, true); assert.equal(gift.discount, '')
  const discount = reviseOffer('Сделай скидку 25% и фон зелёным', gift)!.offer
  assert.equal(discount.gift, false); assert.equal(discount.discount, '25')
  assert.equal(discount.title, 'Скидка 25% на первую покупку')
  assert.equal(discount.promo, 'ЗЕРНО')
})
test('invalid and unsupported commands leave draft unchanged', () => {
  for (const request of ['скидка 120%', 'скидка 0%', 'нарисуй слона', '']) assert.equal(reviseOffer(request, draft), null)
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
