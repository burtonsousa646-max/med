import { offerErrors, withOfferDiscount, type OfferDraft, type Tone } from '../../shared/campaign-offer.ts'
export { emptyOffer, offerErrors, type OfferDraft } from '../../shared/campaign-offer.ts'

// shortcut: supported demo commands only; replace with model output before production.
export function reviseOffer(request: string, current: OfferDraft): { offer: OfferDraft; message: string } | null {
  const text = request.toLowerCase()
  if (/(?:^|\s)не\s+(?:меняй|изменяй|ставь|добавляй|делай|нужно)/.test(text)) return null
  if (/(?:^|\s)до\s*\d{1,2}\s*%/i.test(text)) return null
  let next = { ...current }
  const changes: string[] = []
  const colors: [RegExp, Tone][] = [[/фиолетов/, 'violet'], [/зел[её]н/, 'green'], [/син(?:ий|им|его)|голуб/, 'blue'], [/ж[её]лт/, 'light']]
  const color = colors.find(([pattern]) => pattern.test(text))
  if (color) { next.tone = color[1]; changes.push('изменил фон') }
  if (/1\s*\+\s*1|второй.*(?:подар|бесплат)/.test(text)) {
    next = { ...withOfferDiscount(next, ''), gift: true }
    if (/второй кофе в подарок/.test(text)) next.title = 'Второй кофе в подарок'
    changes.push('добавил акцию 1 + 1')
  } else {
    const discount = /(?:скидк[ауи]?\s*(?:на\s*)?|[−-])(\d{1,3})\s*%?|\b(\d{1,3})\s*(?:%|процент)/.exec(text)
    if (discount) {
      const value = Number(discount[1] || discount[2])
      if (value < 1 || value > 99) return null
      next = withOfferDiscount(next, String(value))
      changes.push('изменил скидку на ' + value + '%')
    }
  }
  if (/(?:увелич|крупнее|больше).*(?:чаш|кофе|изображен|картинк)|(?:чаш|кофе|изображен|картинк).*(?:крупнее|больше)/.test(text)) { next.zoom = true; changes.push('увеличил изображение') }
  if (/(?:уменьш|меньше).*(?:чаш|кофе|изображен|картинк)|(?:чаш|кофе|изображен|картинк).*меньше/.test(text)) { next.zoom = false; changes.push('уменьшил изображение') }
  const promo = /промокод\s*[:=]?\s*[«"“]?([a-zа-яё0-9_-]+)(?=$|[\s»"”,.!?])/i.exec(request)
  if (/(?:убери|удали)\s+промокод(?=$|[\s.,!?])/i.test(request)) {
    next.promo = ''; changes.push('убрал промокод')
  } else if (promo) {
    next.promo = promo[1]
    if (offerErrors(next).promo) return null
    changes.push('добавил промокод')
  }
  const title = /заголовок\s*[:—-]?\s*[«"“](.+?)[»"”]/i.exec(request)
  if (title && title[1].trim().length >= 5 && title[1].trim().length <= 90) { next.title = title[1].trim(); changes.push('изменил заголовок') }
  return changes.length && !offerErrors(next).discount ? { offer: next, message: changes.join(', ') } : null
}
