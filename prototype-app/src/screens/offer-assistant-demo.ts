import type { OfferDraft, Tone } from '../../shared/campaign-offer.ts'
export { emptyOffer, offerErrors, type OfferDraft } from '../../shared/campaign-offer.ts'

// shortcut: supported demo commands only; replace with model output before production.
export function reviseOffer(request: string, current: OfferDraft): { offer: OfferDraft; message: string } | null {
  const text = request.toLowerCase()
  const next = { ...current }
  const changes: string[] = []
  const colors: [RegExp, Tone][] = [[/фиолетов/, 'violet'], [/зел[её]н/, 'green'], [/син(?:ий|им|его)|голуб/, 'blue'], [/ж[её]лт/, 'light']]
  const color = colors.find(([pattern]) => pattern.test(text))
  if (color) { next.tone = color[1]; changes.push('изменил фон') }
  if (/1\s*\+\s*1|второй.*(?:подар|бесплат)/.test(text)) {
    next.gift = true; next.discount = ''; next.title = /кофе/.test(text) ? 'Второй кофе в подарок' : 'Второй в подарок'; changes.push('добавил второй кофе в подарок')
  } else {
    const discount = /(?:скидк[ауи]?\s*(?:на\s*)?|[−-])(\d{1,3})\s*%?|\b(\d{1,3})\s*(?:%|процент)/.exec(text)
    if (discount) {
      const value = Number(discount[1] || discount[2])
      if (value < 1 || value > 99) return null
      next.discount = String(value); next.gift = false; next.title = `Скидка ${value}% на первую покупку`; changes.push(`изменил скидку на ${value}%`)
    }
  }
  if (/(?:увелич|крупнее|больше).*(?:чаш|кофе|изображен|картинк)|(?:чаш|кофе|изображен|картинк).*(?:крупнее|больше)/.test(text)) { next.zoom = true; changes.push('увеличил изображение') }
  if (/(?:уменьш|меньше).*(?:чаш|кофе|изображен|картинк)|(?:чаш|кофе|изображен|картинк).*меньше/.test(text)) { next.zoom = false; changes.push('уменьшил изображение') }
  const promo = /промокод\s*[«"“]?([a-zа-яё0-9_-]{2,24})/i.exec(request)
  if (promo) { next.promo = promo[1].toUpperCase(); changes.push('добавил промокод') }
  const title = /заголовок\s*[:—-]?\s*[«"“](.+?)[»"”]/i.exec(request)
  if (title && title[1].trim().length >= 5 && title[1].trim().length <= 90) { next.title = title[1].trim(); changes.push('изменил заголовок') }
  return changes.length ? { offer: next, message: changes.join(', ') } : null
}
