import { innError, phoneError, textError, websiteError, type Business } from './campaign-business.ts'
import { emptyOffer, offerErrors, type OfferDraft } from './campaign-offer.ts'

export const campaignStages = ['business', 'details', 'offer', 'audience', 'success'] as const
export type CampaignDraft = {
  business: Business; addresses: string[]; online: boolean; offer: OfferDraft;
  offerImage: File | null; logoImage: File | null; audience: number[]; triggers: string;
  confirmedInn: string; generatedTitle: string; filled: boolean; hasProfile: boolean;
  stage: number; reached: number; offerAccepted?: boolean;
}

export function emptyCampaignDraft(): CampaignDraft {
  return {
    business: { name: '', inn: '', phone: '', category: '', website: '', city: '' },
    addresses: [''], online: false, offer: { ...emptyOffer }, offerImage: null, logoImage: null,
    audience: [0, 0, 0, 0, 0], triggers: '', confirmedInn: '', generatedTitle: '',
    filled: false, hasProfile: false, stage: 0, reached: 0, offerAccepted: false,
  }
}

export function isCampaignDraft(value: unknown): value is CampaignDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as CampaignDraft
  const sample = emptyCampaignDraft()
  return Boolean(draft.business && draft.offer)
    && Object.keys(sample.business).every(key => typeof draft.business[key as keyof Business] === 'string')
    && Object.keys(emptyOffer).every(key => typeof draft.offer[key as keyof OfferDraft] === typeof emptyOffer[key as keyof OfferDraft])
    && ['red', 'green', 'blue', 'violet', 'magenta', 'teal', 'dark', 'light'].includes(draft.offer.tone)
    && Array.isArray(draft.addresses) && draft.addresses.length > 0 && draft.addresses.length <= 10 && draft.addresses.every(address => typeof address === 'string')
    && Array.isArray(draft.audience) && draft.audience.length === 5 && draft.audience.every(index => Number.isInteger(index) && index >= 0 && index <= 2)
    && ['triggers', 'confirmedInn', 'generatedTitle'].every(key => typeof draft[key as keyof CampaignDraft] === 'string')
    && ['online', 'filled', 'hasProfile'].every(key => typeof draft[key as keyof CampaignDraft] === 'boolean')
    && (draft.offerAccepted === undefined || typeof draft.offerAccepted === 'boolean')
    && [draft.offerImage, draft.logoImage].every(file => file === null || (file instanceof File && file.size <= 5 * 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)))
    && Number.isInteger(draft.stage) && Number.isInteger(draft.reached) && draft.stage >= 0 && draft.stage <= draft.reached && draft.reached < campaignStages.length
}

export function campaignAllowedStage(draft: CampaignDraft) {
  const { business, addresses, online, offer, audience } = draft
  if (!draft.offerAccepted || draft.confirmedInn !== business.inn || innError(business.inn) || phoneError(business.phone)) return 0
  if (websiteError(business.website) || textError(business.name) || business.name.length > 80 || textError(business.category, '', 3) || business.category.length > 100
    || (!online && (textError(business.city) || business.city.length > 80 || !addresses.length || addresses.some((address, index) => textError(address, '', 5) || address.length > 200 || addresses.some((other, i) => i !== index && other.trim().toLowerCase() === address.trim().toLowerCase()))))) return 1
  if (!draft.filled || Object.values(offerErrors(offer)).some(Boolean)) return 2
  if (audience[0] === 1 && (textError(business.city) || business.city.length > 80)) return 3
  return 4
}


export const audienceGroups = [
  { title: 'геолокация', choices: ['рядом с точкой', 'весь город', 'вся Россия'] },
  { title: 'пол', choices: ['любой', 'женщины', 'мужчины'] },
  { title: 'возраст', choices: ['любой', '18–34', '35 и старше'] },
  { title: 'уровень дохода', choices: ['любой', 'средний', 'выше среднего'] },
  { title: 'жизненные ситуации', choices: ['любые', 'недавно переехали', 'день зарплаты'] },
]
