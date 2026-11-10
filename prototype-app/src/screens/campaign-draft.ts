import { campaignAllowedStage, campaignStages, emptyCampaignDraft, isCampaignDraft, type CampaignDraft } from '../../shared/campaign-draft.ts'
export { campaignAllowedStage, campaignStages, emptyCampaignDraft, isCampaignDraft, type CampaignDraft } from '../../shared/campaign-draft.ts'

export type StoredCampaignDraft = CampaignDraft & { syncId?: string; submitted?: boolean; registeredAddress?: string }

export function campaignStage(requested: string | undefined, draft: StoredCampaignDraft) {
  const allowed = Math.min(draft.submitted === true ? 4 : 3, draft.reached, campaignAllowedStage(draft))
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

export async function loadCampaignDraft(): Promise<StoredCampaignDraft> {
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
