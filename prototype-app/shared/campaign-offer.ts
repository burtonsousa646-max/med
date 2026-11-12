import { localDate, textError } from './campaign-business.ts'

export type Tone = 'red' | 'green' | 'blue' | 'violet' | 'magenta' | 'teal' | 'dark' | 'light'
export const offerLayouts = { split: 'Фото сбоку', photo: 'Фото сверху', text: 'Типографика' } as const
export type OfferLayout = keyof typeof offerLayouts
export type OfferDraft = { title: string; promo: string; discount: string; until: string; tone: Tone; gift: boolean; zoom: boolean; layout?: OfferLayout }
export const emptyOffer: OfferDraft = { title: '', promo: '', discount: '', until: '', tone: 'violet', gift: false, zoom: false }

export function resolveOfferLayout(layout: OfferLayout | undefined, hasImage: boolean): OfferLayout {
  return hasImage ? layout ?? 'split' : 'text'
}

export function nextOfferDesign(offer: OfferDraft, hasImage: boolean): OfferDraft {
  const tones: Tone[] = ['violet', 'blue', 'green', 'magenta', 'teal', 'dark', 'red', 'light']
  return {
    ...offer,
    tone: tones[(tones.indexOf(offer.tone) + 1) % tones.length],
    layout: !hasImage || offer.layout === 'text' ? 'text' : offer.layout === 'photo' ? 'split' : 'photo',
  }
}

const leadingDiscount = /^((?:скидка\s+)?[−-]?)(\d{1,3})(\s*%)(?=\s|$)/i

export function offerDisplayTitle(offer: OfferDraft) {
  const title = offer.title.trim()
  if (!offer.discount) return title
  const stated = leadingDiscount.exec(title)
  const subject = (stated && Number(stated[2]) === Number(offer.discount) ? title.slice(stated[0].length).trimStart() : title)
    .replace(/^скидка\s+(?=на\s)/i, '').trim()
  return subject ? subject[0].toUpperCase() + subject.slice(1) : 'Скидка'
}

export function offerCreativeCopy(offer: OfferDraft) {
  const title = offerDisplayTitle(offer)
  if (offer.gift) return { benefit: '1 + 1', title }
  if (offer.discount) return { benefit: '−' + offer.discount + '%', title }

  const leadingValue = /^(\d+(?:[ \u00a0\u202f]\d{3})*(?:\s*₽|(?=\s+балл(?:а|ов)?(?:\s|$))))(?:\s+|$)/i.exec(title)
  return leadingValue ? { benefit: leadingValue[1], title: title.slice(leadingValue[0].length) } : { benefit: '', title }
}

export function withOfferDiscount(offer: OfferDraft, discount: string): OfferDraft {
  if (offer.gift && discount && /^Второй(?: кофе)? в подарок$/i.test(offer.title)) {
    return { ...offer, title: /кофе/i.test(offer.title) ? 'На кофе' : 'Скидка', discount, gift: false }
  }
  const title = offer.discount && offer.discount !== discount
    ? offer.title.trim().replace(leadingDiscount, (match, prefix: string, previous: string, suffix: string) =>
      Number(previous) !== Number(offer.discount) ? match : discount ? prefix + discount + suffix : '')
    : offer.title
  return { ...offer, discount, title: title.trim() || 'Скидка', gift: discount ? false : offer.gift }
}

export function offerErrors(offer: OfferDraft) {
  const date = new Date(`${offer.until}T00:00:00Z`)
  const stated = leadingDiscount.exec(offer.title.trim())
  return {
    title: textError(offer.title, 'Заголовок', 5) || (offer.title.length > 90 ? 'Не более 90 символов' : ''),
    promo: offer.promo && !/^[a-zа-яё0-9_-]{2,24}$/i.test(offer.promo) ? 'От 2 до 24 символов: буквы, цифры, дефис или подчёркивание' : '',
    discount: offer.discount && (!/^\d+$/.test(offer.discount) || +offer.discount < 1 || +offer.discount > 99) ? 'Введите целую скидку от 1 до 99%'
      : offer.discount && stated && Number(stated[2]) !== Number(offer.discount) ? 'Укажите одинаковую скидку в заголовке и в поле скидки' : '',
    until: offer.until && (!/^\d{4}-\d{2}-\d{2}$/.test(offer.until) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== offer.until || offer.until < localDate()) ? 'Выберите сегодняшнюю или более позднюю дату' : '',
  }
}
