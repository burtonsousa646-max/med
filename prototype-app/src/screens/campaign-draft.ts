import { innError, phoneError, textError, type Business } from '../../shared/campaign-business.ts'
import { emptyOffer, offerErrors, type OfferDraft } from './offer-assistant-demo.ts'

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
  if (textError(business.name) || business.name.length > 80 || textError(business.category, '', 3) || business.category.length > 100
    || (!online && (textError(business.city) || business.city.length > 80 || !addresses.length || addresses.some((address, index) => textError(address, '', 5) || address.length > 200 || addresses.some((other, i) => i !== index && other.trim().toLowerCase() === address.trim().toLowerCase()))))) return 1
  if (!draft.filled || Object.values(offerErrors(offer)).some(Boolean)) return 2
  if (audience[0] === 1 && (textError(business.city) || business.city.length > 80)) return 3
  return 4
}

export function campaignStage(requested: string | undefined, draft: CampaignDraft) {
  const allowed = Math.min(draft.reached, campaignAllowedStage(draft))
  const index = campaignStages.indexOf((requested === 'preview' ? 'success' : requested) as typeof campaignStages[number])
  return index >= 0 ? Math.min(index, allowed) : Math.min(draft.stage, allowed)
}

let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('med-campaign-draft', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
    request.onblocked = () => { database = undefined; reject(new Error('Draft storage is blocked')) }
  })
}

// shortcut: one draft on this device; add account-bound server storage before production.
export async function loadCampaignDraft(): Promise<CampaignDraft> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get('v4')
    request.onsuccess = () => {
      if (request.result !== undefined && !isCampaignDraft(request.result)) { reject(new Error('Invalid draft')); return }
      resolve(request.result ?? emptyCampaignDraft())
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveCampaignDraft(draft: CampaignDraft) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    transaction.objectStore('drafts').put(draft, 'v4')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
