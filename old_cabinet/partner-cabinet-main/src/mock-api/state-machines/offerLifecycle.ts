import { createStateMachine } from './createStateMachine'
import type { OfferLifecycleStatus } from '../types/offer'

export type OfferAction =
  | 'submit_for_review'
  | 'request_changes'
  | 'approve'
  | 'reject'
  | 'revise'
  | 'schedule'
  | 'publish'
  | 'pause'
  | 'resume'
  | 'expire'
  | 'archive'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Offer
 * draft → in_review → approved → scheduled → published
 * in_review → changes_requested → draft; in_review → rejected
 * published → paused → published; published/paused → expired → archived
 */
export const offerLifecycle = createStateMachine<OfferLifecycleStatus, OfferAction>('Оффер', {
  draft: { submit_for_review: 'in_review' },
  in_review: { request_changes: 'changes_requested', approve: 'approved', reject: 'rejected' },
  changes_requested: { revise: 'draft' },
  approved: { schedule: 'scheduled' },
  scheduled: { publish: 'published' },
  published: { pause: 'paused', expire: 'expired' },
  paused: { resume: 'published', expire: 'expired' },
  expired: { archive: 'archived' },
  rejected: {},
  archived: {},
})
