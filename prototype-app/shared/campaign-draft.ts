import { innError, phoneError, textError, websiteError, normalizeBusinessWebsite, type Business } from './campaign-business.ts'
import { emptyOffer, offerErrors, offerLayouts, type OfferDraft } from './campaign-offer.ts'
import type { PartnerDetails } from './partner-details.ts'

export const campaignStages = ['business', 'details', 'offer', 'audience', 'email', 'success'] as const
export type CampaignDraft = {
  setupMode?: 'quick' | 'manual'; contactName?: string;
  partnerDetails?: PartnerDetails;
  business: Business; addresses: string[]; online: boolean; offer: OfferDraft;
  offerImage: File | null; logoImage: File | null; audience: number[]; audienceCity?: string; email?: string; triggers: string;
  confirmedInn: string; generatedTitle: string; filled: boolean; hasProfile: boolean;
  stage: number; reached: number; offerAccepted?: boolean;
}

export function emptyCampaignDraft(): CampaignDraft {
  return {
    business: { name: '', inn: '', phone: '', category: '', website: '', city: '' },
    addresses: [''], online: false, offer: { ...emptyOffer }, offerImage: null, logoImage: null,
    audience: [0, 0, 0, 0, 0], audienceCity: undefined, email: undefined, triggers: '', confirmedInn: '', generatedTitle: '',
    filled: false, hasProfile: false, stage: 0, reached: 0, offerAccepted: false,
  }
}

export function normalizeCampaignEmail(value: string) {
  const email = value.trim()
  const parts = email.split('@')
  if (email.length > 254 || parts.length !== 2 || parts[0].length > 64
    || !/^[a-z\d_+%=-]+(?:\.[a-z\d_+%=-]+)*$/i.test(parts[0])
    || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(parts[1])) return ''
  return parts[0] + '@' + parts[1].toLowerCase()
}

export function isCampaignDraft(value: unknown): value is CampaignDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as CampaignDraft
  const sample = emptyCampaignDraft()
  return Boolean(draft.business && draft.offer)
    && (draft.setupMode === undefined || draft.setupMode === 'quick' || draft.setupMode === 'manual')
    && (draft.contactName === undefined || (typeof draft.contactName === 'string' && draft.contactName.length <= 100 && !/[\u0000-\u001f\u007f]/.test(draft.contactName)))
    && Object.keys(sample.business).every(key => typeof draft.business[key as keyof Business] === 'string')
    && Object.keys(emptyOffer).every(key => typeof draft.offer[key as keyof OfferDraft] === typeof emptyOffer[key as keyof OfferDraft])
    && (draft.offer.layout === undefined || (typeof draft.offer.layout === 'string' && Object.hasOwn(offerLayouts, draft.offer.layout)))
    && (draft.offer.background === undefined || (typeof draft.offer.background === 'string' && /^#[a-f0-9]{6}$/i.test(draft.offer.background)))
    && ['red', 'green', 'blue', 'violet', 'magenta', 'teal', 'dark', 'light'].includes(draft.offer.tone)
    && Array.isArray(draft.addresses) && draft.addresses.length > 0 && draft.addresses.length <= 10 && draft.addresses.every(address => typeof address === 'string')
    && Array.isArray(draft.audience) && draft.audience.length === 5 && draft.audience.every(index => Number.isInteger(index) && index >= 0 && index <= 2)
    && (draft.audienceCity === undefined || (typeof draft.audienceCity === 'string' && draft.audienceCity.length <= 80))
    && (draft.email === undefined || (typeof draft.email === 'string' && Boolean(normalizeCampaignEmail(draft.email))))
    && ['triggers', 'confirmedInn', 'generatedTitle'].every(key => typeof draft[key as keyof CampaignDraft] === 'string')
    && ['online', 'filled', 'hasProfile'].every(key => typeof draft[key as keyof CampaignDraft] === 'boolean')
    && (draft.offerAccepted === undefined || typeof draft.offerAccepted === 'boolean')
    && [draft.offerImage, draft.logoImage].every(file => file === null || (file instanceof File && file.size <= 5 * 1024 * 1024 && ['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)))
    && Number.isInteger(draft.stage) && Number.isInteger(draft.reached) && draft.stage >= 0 && draft.stage <= draft.reached && draft.reached < campaignStages.length
}

export function hasApplicationContact(draft: CampaignDraft) {
  return Boolean(draft.contactName?.trim() && !phoneError(draft.business.phone) && !innError(draft.business.inn))
}

export function campaignAllowedStage(draft: CampaignDraft) {
  const { business, addresses, online, offer, audience } = draft
  if (draft.setupMode) {
    if (!normalizeBusinessWebsite(business.website) && textError(business.category, '', 3)) return 0
  } else if (!draft.offerAccepted || draft.confirmedInn !== business.inn || innError(business.inn) || phoneError(business.phone)) return 0
  if (websiteError(business.website) || textError(business.name) || business.name.length > 80 || textError(business.category, '', 3) || business.category.length > 100
    || (!online && (textError(business.city) || business.city.length > 80 || !addresses.length || addresses.some((address, index) => textError(address, '', 5) || address.length > 200 || addresses.some((other, i) => i !== index && other.trim().toLowerCase() === address.trim().toLowerCase()))))) return 1
  if (!draft.filled || (offer.layout === 'artwork' && !draft.offerImage) || Object.values(offerErrors(offer)).some(Boolean)) return 2
  const city = draft.audienceCity ?? business.city
  if (audience[0] === 1 && (textError(city) || city.length > 80)) return 3
  return 4
}


export const audienceGroups = [
  { title: 'геолокация', choices: ['рядом с точкой', 'весь город', 'вся Россия'] },
  { title: 'пол', choices: ['любой', 'женщины', 'мужчины'] },
  { title: 'возраст', choices: ['любой', '18–34', '35 и старше'] },
  { title: 'уровень дохода', choices: ['любой', 'средний', 'выше среднего'] },
  { title: 'жизненные ситуации', choices: ['любые', 'недавно переехали', 'день зарплаты'] },
]
