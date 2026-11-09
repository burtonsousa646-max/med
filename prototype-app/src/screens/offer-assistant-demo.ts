import type { Tone } from '../creative'
import { localDate, textError } from '../../shared/campaign-business.ts'

export type OfferDraft = { title: string; promo: string; discount: string; until: string; tone: Tone; gift: boolean; zoom: boolean }
export const emptyOffer: OfferDraft = { title: '', promo: '', discount: '', until: '', tone: 'violet', gift: false, zoom: false }

export function offerErrors(offer: OfferDraft) {
  const date = new Date(`${offer.until}T00:00:00Z`)
  return {
    title: textError(offer.title, 'Заголовок', 5) || (offer.title.length > 90 ? 'Не более 90 символов' : ''),
    promo: offer.promo && !/^[a-zа-яё0-9_-]{2,24}$/i.test(offer.promo) ? 'От 2 до 24 символов: буквы, цифры, дефис или подчёркивание' : '',
    discount: offer.discount && (!/^\d+$/.test(offer.discount) || +offer.discount < 1 || +offer.discount > 99) ? 'Введите целую скидку от 1 до 99%' : '',
    until: offer.until && (!/^\d{4}-\d{2}-\d{2}$/.test(offer.until) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== offer.until || offer.until < localDate()) ? 'Выберите сегодняшнюю или более позднюю дату' : '',
  }
}

// shortcut: supported demo commands only; replace with model output before production.
export function reviseOffer(request: string, current: OfferDraft): { offer: OfferDraft; message: string } | null {
  const text = request.toLowerCase()
  const next = { ...current }
  const changes: string[] = []
  const colors: [RegExp, Tone][] = [[/фиолетов/, 'violet'], [/зел[её]н/, 'green'], [/син(?:ий|им|его)|голуб/, 'blue'], [/ж[её]лт/, 'light']]
  const color = colors.find(([pattern]) => pattern.test(text))
  if (color) { next.tone = color[1]; changes.push('изменил фон') }
  if (/1\s*\+\s*1|второй.*(?:подар|бесплат)/.test(text)) {
    next.gift = true; next.discount = ''; next.title = 'Второй кофе в подарок'; changes.push('добавил второй кофе в подарок')
  } else {
    const discount = /(?:скидк[ауи]?\s*(?:на\s*)?|[−-])(\d{1,3})\s*%?|\b(\d{1,3})\s*(?:%|процент)/.exec(text)
    if (discount) {
      const value = Number(discount[1] || discount[2])
      if (value < 1 || value > 99) return null
      next.discount = String(value); next.gift = false; next.title = `Скидка ${value}% на первую покупку`; changes.push(`изменил скидку на ${value}%`)
    }
  }
  if (/(?:увелич|крупнее|больше).*(?:чаш|кофе)|(?:чаш|кофе).*(?:крупнее|больше)/.test(text)) { next.zoom = true; changes.push('увеличил чашку') }
  if (/(?:уменьш|меньше).*(?:чаш|кофе)|(?:чаш|кофе).*меньше/.test(text)) { next.zoom = false; changes.push('уменьшил чашку') }
  const promo = /промокод\s*[«"“]?([a-zа-яё0-9_-]{2,24})/i.exec(request)
  if (promo) { next.promo = promo[1].toUpperCase(); changes.push('добавил промокод') }
  const title = /заголовок\s*[:—-]?\s*[«"“](.+?)[»"”]/i.exec(request)
  if (title && title[1].trim().length >= 5 && title[1].trim().length <= 90) { next.title = title[1].trim(); changes.push('изменил заголовок') }
  return changes.length ? { offer: next, message: changes.join(', ') } : null
}
