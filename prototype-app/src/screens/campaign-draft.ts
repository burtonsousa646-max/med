import { campaignAllowedStage, campaignStages, emptyCampaignDraft, isCampaignDraft, normalizeCampaignEmail, type CampaignDraft } from '../../shared/campaign-draft.ts'
export { campaignAllowedStage, campaignStages, emptyCampaignDraft, isCampaignDraft, type CampaignDraft } from '../../shared/campaign-draft.ts'

export type StoredCampaignDraft = CampaignDraft & {
  emailCheck?: { email: string };
  syncId?: string; submitted?: boolean; registeredAddress?: string;
  offerCutout?: File; keepOriginalImage?: boolean; logoWebsite?: string; skippedLogoWebsite?: string;
}

export function campaignDraftForServer(draft: StoredCampaignDraft): CampaignDraft {
  const { offerCutout, keepOriginalImage, logoWebsite, skippedLogoWebsite, emailCheck, ...fields } = draft
  const offerImage = keepOriginalImage || draft.offer.layout === 'photo' ? draft.offerImage : offerCutout ?? draft.offerImage
  return { ...fields, offerImage }
}

export function campaignStage(requested: string | undefined, draft: StoredCampaignDraft) {
  const ready = campaignAllowedStage(draft)
  const allowed = Math.min(ready === 4 && draft.submitted ? 5 : ready, draft.reached)
  const index = campaignStages.indexOf((requested === 'preview' ? 'success' : requested) as typeof campaignStages[number])
  return index >= 0 ? Math.min(index, allowed) : Math.min(draft.stage, allowed)
}

export function restoreCampaignDraft(draft: StoredCampaignDraft) {
  // Before confirmation was introduced, stage 4 was the success screen.
  if (draft.submitted && draft.stage === 4) return { ...draft, stage: 5, reached: 5 }
  if (draft.emailCheck && (typeof draft.emailCheck.email !== 'string' || !normalizeCampaignEmail(draft.emailCheck.email))) {
    return { ...draft, emailCheck: undefined }
  }
  return draft
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

export async function loadCampaignDraft(): Promise<StoredCampaignDraft> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get('v4')
    request.onsuccess = () => {
      if (request.result !== undefined && !isCampaignDraft(request.result)) { reject(new Error('Invalid draft')); return }
      const draft = restoreCampaignDraft(request.result ?? emptyCampaignDraft())
      if (draft.offerCutout && (!(draft.offerCutout instanceof File) || draft.offerCutout.type !== 'image/png' || draft.offerCutout.size > 5 * 1024 * 1024)) {
        delete draft.offerCutout
      }
      resolve(draft)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveCampaignDraft(draft: StoredCampaignDraft) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    transaction.objectStore('drafts').put(draft, 'v4')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
