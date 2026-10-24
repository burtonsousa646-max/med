import type { ISODateTime, MinorMoney, Timestamped, UUID } from './common'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Offer lifecycle */
export type OfferLifecycleStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'rejected'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'paused'
  | 'expired'
  | 'archived'

export type OfferMechanic = 'coupon' | 'promocode' | 'subscription' | 'service'
export type CommissionModel = 'CPA' | 'CPS' | 'RevShare'
/** Модель оффера — кто кому платит: купон, CPA, CPS или подписка (content/offerModels.ts). */
export type OfferModel = 'voucher' | 'cpa' | 'cps' | 'subscription'

export interface Offer extends Timestamped {
  id: UUID
  partnerId: UUID
  title: string
  currentLiveVersion: number | null
  lifecycleStatus: OfferLifecycleStatus
}

export interface OfferVersion {
  id: UUID
  offerId: UUID
  partnerId: UUID
  revision: number
  mechanic: OfferMechanic
  /** Необязательно: у версий, созданных до введения моделей, выводится из mechanic + commissionModel. */
  monetizationModel?: OfferModel
  benefit: string
  description: string
  couponPrice: MinorMoney
  servicePrice: MinorMoney
  region: string
  startDate: ISODateTime
  endDate: ISODateTime
  usageRules: string
  refundRules: string
  supportContact: string
  commissionModel: CommissionModel
  outletIds: UUID[]
  iconDataUrl: string | null
  moderationStatus: OfferLifecycleStatus
  moderationNotes: ModerationNote[]
  createdAt: ISODateTime
  /** Когда версия последний раз ушла на модерацию — используется для SLA/автомодерации,
   *  отдельно от createdAt (версия может долго лежать черновиком до отправки). */
  submittedForReviewAt: ISODateTime | null
}

export interface ModerationNote {
  id: UUID
  field: string | null
  message: string
  authorLabel: string
  createdAt: ISODateTime
}

/** SOURCE: MED_HANDOFF/09_BUSINESS_RULES.md — политика версионируется, не общий "20%" */
export interface CommissionPolicyVersion {
  id: UUID
  offerVersionId: UUID
  model: CommissionModel
  rate: number | null // доля 0..1 для CPS/RevShare
  fixedFeeMinor: number | null // фиксированная комиссия для CPA
  effectiveFrom: ISODateTime
}

export type CodeStatus = 'available' | 'reserved' | 'issued' | 'redeemed' | 'expired' | 'revoked'

export interface CodeBatch {
  id: UUID
  offerVersionId: UUID
  partnerId: UUID
  createdAt: ISODateTime
  totalCodes: number
  expiresAt: ISODateTime
}

export interface CouponCode {
  id: UUID
  batchId: UUID
  code: string
  status: CodeStatus
  reservedOrderId: UUID | null
}

export interface CampaignRequest {
  id: UUID
  partnerId: UUID
  offerVersionId: UUID
  offerTitle: string
  criteria: string
  desiredChannels: string[]
  desiredDates: string
  status: 'requested' | 'approved' | 'scheduled' | 'rejected' | 'cancelled'
  createdAt: ISODateTime
}
