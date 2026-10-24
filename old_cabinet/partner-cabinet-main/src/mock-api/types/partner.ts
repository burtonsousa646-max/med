import type { ISODateTime, Timestamped, UUID, Versioned } from './common'
import type { Role, SessionScope } from '@/types/session'

/** SOURCE: MED_HANDOFF/08_STATE_MACHINES.md — Partner lifecycle */
export type PartnerLifecycleStatus =
  | 'draft'
  | 'submitted'
  | 'checking'
  | 'needs_info'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'terminating'
  | 'terminated'
  | 'rejected'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface Partner extends Timestamped, Versioned {
  id: UUID
  legalName: string
  taxId: string // ИНН
  kpp?: string // КПП (у ИП нет)
  ogrn: string // ОГРН/ОГРНИП
  legalForm: 'ООО' | 'АО' | 'ИП'
  address: string
  signatoryName: string
  signatoryBasis: string
  bankName?: string
  bik?: string
  accountNumber?: string
  contactEmail: string
  contactPhone: string
  /** Материалы бренда, загруженные при подключении: основа обложки офферов. */
  brandAssetKind?: 'logo' | 'product'
  brandAssetDataUrl?: string
  brandAssetName?: string
  /** Согласие на использование товарного знака и материалов бренда. */
  trademarkConsentAt?: ISODateTime
  lifecycleStatus: PartnerLifecycleStatus
  riskStatus: RiskLevel | null
  kamUserId: UUID | null
}

export interface Outlet extends Timestamped {
  id: UUID
  partnerId: UUID
  name: string
  address: string
  online: boolean
  timezone: string
  hours: string
  status: 'active' | 'closed'
}

export interface Membership {
  id: UUID
  partnerId: UUID | null // null для internal-сотрудников
  userId: UUID
  displayName: string
  email: string
  scope: SessionScope
  role: Role
  status: 'active' | 'blocked'
  invitedAt: ISODateTime
}

/** SOURCE: MED_HANDOFF/07_DATA_MODEL.md CheckRequest */
export type CheckRequestStatus = 'pending' | 'needs_info' | 'approved' | 'rejected'

export interface CheckRequest {
  id: UUID
  partnerId: UUID
  createdAt: ISODateTime
  status: CheckRequestStatus
  riskLevel: RiskLevel | null
  reason: string | null
  reviewerId: UUID | null
  reviewerLabel: string | null
  decidedAt: ISODateTime | null
}

export type DocumentType = 'offer_agreement' | 'nda'

export interface DocumentVersion {
  id: UUID
  type: DocumentType
  version: number
  title: string
  contentSummary: string
  fullText: string
  effectiveAt: ISODateTime
  status: 'effective' | 'superseded'
}

export interface Acceptance {
  id: UUID
  partnerId: UUID
  documentVersionId: UUID
  signatoryId: UUID
  signatoryLabel: string
  authorityRef: string
  acceptedAt: ISODateTime
}

export type IntegrationLevel = 'L0' | 'L1' | 'L2' | 'L3'
export type IntegrationLifecycleStatus =
  | 'not_configured'
  | 'configuring'
  | 'testing'
  | 'failed'
  | 'ready'
  | 'active'
  | 'degraded'
  | 'paused'
  | 'revoked'

export interface Integration {
  id: UUID
  partnerId: UUID
  level: IntegrationLevel
  connector: string
  environment: 'sandbox' | 'production'
  lifecycleStatus: IntegrationLifecycleStatus
  notes: string
  updatedAt: ISODateTime
}

export interface SandboxTestRun {
  id: UUID
  integrationId: UUID
  scenario: string
  startedAt: ISODateTime
  finishedAt: ISODateTime | null
  result: 'running' | 'passed' | 'failed'
  events: string[]
}
