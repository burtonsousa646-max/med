import type { components, operations } from '../src/api.gen.ts'
import { offerCreativeCopy, type OfferDraft } from './campaign-offer.ts'

export type PosterSource = components['schemas']['PartnerPosterSource']
export type PosterList = operations['listPartnerPosterSources']['responses'][200]['content']['application/json']

export function posterSource(business: {name:string; inn:string; website?:string}, offer:OfferDraft,
  image = '', logo = '', catalog?: {brand?:string; benefit?:string; condition?:string}): PosterSource {
  const copy = offerCreativeCopy(offer)
  const expiry = offer.until && offer.until.split('-').reverse().join('.')
  return {
    brand: catalog?.brand || business.name,
    headline: catalog?.condition || copy.title || offer.title,
    subline: offer.promo ? 'По промокоду ' + offer.promo : '',
    benefit: catalog?.benefit || copy.benefit,
    terms: [business.name, business.inn && 'ИНН ' + business.inn, expiry && 'Действует до ' + expiry,
      business.website?.replace(/^https?:\/\//i, '').replace(/\/$/, '')].filter(Boolean).join(' · '),
    image, logo,
  }
}
