import { createStateMachine } from './createStateMachine'
import type { PartnerLifecycleStatus } from '../types/partner'

export type PartnerAction =
  | 'submit'
  | 'start_check'
  | 'request_info'
  | 'resubmit'
  | 'approve'
  | 'reject'
  | 'activate'
  | 'suspend'
  | 'reactivate'
  | 'begin_offboarding'
  | 'complete_offboarding'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Partner
 * draft → submitted → checking → approved → active
 * checking → needs_info → submitted; checking → rejected
 * active ↔ suspended; active/suspended → terminating → terminated
 */
export const partnerLifecycle = createStateMachine<PartnerLifecycleStatus, PartnerAction>('Партнёр', {
  draft: { submit: 'submitted' },
  submitted: { start_check: 'checking' },
  checking: { request_info: 'needs_info', approve: 'approved', reject: 'rejected' },
  needs_info: { resubmit: 'submitted' },
  approved: { activate: 'active' },
  active: { suspend: 'suspended', begin_offboarding: 'terminating' },
  suspended: { reactivate: 'active', begin_offboarding: 'terminating' },
  terminating: { complete_offboarding: 'terminated' },
  rejected: {},
  terminated: {},
})
