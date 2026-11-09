import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyOffer, reviseOffer } from '../src/screens/offer-assistant-demo.ts'

const draft = { ...emptyOffer, title: 'Мой текст', discount: '20', promo: 'ЗЕРНО', until: '2026-12-01' }
test('color and size preserve manually entered offer fields', () => {
  const result = reviseOffer('Сделай фон фиолетовым и увеличь чашку', draft)!
  assert.deepEqual(result.offer, { ...draft, tone: 'violet', zoom: true })
  assert.equal(draft.tone, 'green')
})
test('gift and discount stay mutually consistent', () => {
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
