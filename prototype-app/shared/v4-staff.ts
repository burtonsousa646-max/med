import type { Business } from './campaign-business.ts'
import type { OfferDraft } from './campaign-offer.ts'

export type V4StaffSession = { email: string; role: 'admin' | 'staff' }
export type V4StaffMember = V4StaffSession & { addedAt: number | null; addedBy: string | null }

export const v4StaffPageSize = 25

export type V4SubmissionSummary = {
  id: string; submittedAt: number; name: string; inn: string; city: string; email: string | null; title: string
}

export type V4SubmissionList = {
  items: V4SubmissionSummary[]; total: number
}

export type V4Submission = {
  id: string; submittedAt: number; business: Business; email?: string; addresses: string[]; online: boolean
  offer: OfferDraft; audience: number[]; audienceCity?: string; triggers: string; offerAccepted?: boolean
  offerImage: string | null; logoImage: string | null
}
