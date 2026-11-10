import { localDate, textError } from './campaign-business.ts'

export type Tone = 'red' | 'green' | 'blue' | 'violet' | 'magenta' | 'teal' | 'dark' | 'light'
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
