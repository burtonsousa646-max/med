import type { Tone } from '../creative'

export type OfferDraft = { title: string; promo: string; discount: string; until: string; tone: Tone; gift: boolean; zoom: boolean }
export const emptyOffer: OfferDraft = { title: '', promo: '', discount: '', until: '', tone: 'violet', gift: false, zoom: false }

// shortcut: supported demo commands only; replace with model output before production.
export function reviseOffer(request: string, current: OfferDraft): { offer: OfferDraft; message: string } | null {
  const text = request.toLowerCase()
  const next = { ...current }
  const changes: string[] = []
  const colors: [RegExp, Tone][] = [[/фиолетов/, 'violet'], [/зел[её]н/, 'green'], [/син(?:ий|им|его)|голуб/, 'blue'], [/ж[её]лт/, 'light']]
  const color = colors.find(([pattern]) => pattern.test(text))
  if (color) { next.tone = color[1]; changes.push('обновили фон') }
  if (/1\s*\+\s*1|второй.*(?:подар|бесплат)/.test(text)) {
    next.gift = true; next.discount = ''; next.title = 'Второй кофе в подарок'; changes.push('добавили предложение 1 + 1')
  } else {
    const discount = /(?:скидк[ауи]?\s*(?:на\s*)?|[−-])(\d{1,3})\s*%?|\b(\d{1,3})\s*(?:%|процент)/.exec(text)
    if (discount) {
      const value = Number(discount[1] || discount[2])
      if (value < 1 || value > 99) return null
      next.discount = String(value); next.gift = false; next.title = `Скидка ${value}% на первую покупку`; changes.push(`изменили скидку на ${value}%`)
    }
  }
  if (/(?:увелич|крупнее|больше).*(?:чаш|кофе)|(?:чаш|кофе).*(?:крупнее|больше)/.test(text)) { next.zoom = true; changes.push('увеличили чашку') }
  if (/(?:уменьш|меньше).*(?:чаш|кофе)|(?:чаш|кофе).*меньше/.test(text)) { next.zoom = false; changes.push('уменьшили чашку') }
  const promo = /промокод\s*[«"“]?([a-zа-яё0-9_-]{2,24})/i.exec(request)
  if (promo) { next.promo = promo[1].toUpperCase(); changes.push('добавили промокод') }
  const title = /заголовок\s*[:—-]?\s*[«"“](.+?)[»"”]/i.exec(request)
  if (title && title[1].trim().length >= 5 && title[1].trim().length <= 90) { next.title = title[1].trim(); changes.push('переписали заголовок') }
  return changes.length ? { offer: next, message: changes.join(', ') } : null
}
