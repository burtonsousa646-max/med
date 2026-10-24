import type {
  Acceptance,
  CampaignRequest,
  CheckRequest,
  CodeBatch,
  CommissionPolicyVersion,
  CouponCode,
  DocumentVersion,
  DomainEvent,
  Integration,
  Membership,
  Notification,
  Offer,
  OfferVersion,
  Order,
  Outlet,
  Partner,
  SandboxTestRun,
  Settlement,
  SettlementLine,
  Discrepancy,
  StatusHistoryEntry,
  SupportCase,
  SupportMessage,
} from '../types'

export interface Database {
  schemaVersion: number
  partners: Partner[]
  outlets: Outlet[]
  memberships: Membership[]
  checkRequests: CheckRequest[]
  documentVersions: DocumentVersion[]
  acceptances: Acceptance[]
  integrations: Integration[]
  sandboxTestRuns: SandboxTestRun[]
  offers: Offer[]
  offerVersions: OfferVersion[]
  commissionPolicies: CommissionPolicyVersion[]
  codeBatches: CodeBatch[]
  couponCodes: CouponCode[]
  campaignRequests: CampaignRequest[]
  orders: Order[]
  statusHistory: StatusHistoryEntry[]
  settlements: Settlement[]
  settlementLines: SettlementLine[]
  discrepancies: Discrepancy[]
  supportCases: SupportCase[]
  supportMessages: SupportMessage[]
  notifications: Notification[]
  events: DomainEvent[]
  idempotencyKeys: Record<string, { payloadHash: string; response: unknown }>
}

export const SCHEMA_VERSION = 1

export function emptyDatabase(): Database {
  return {
    schemaVersion: SCHEMA_VERSION,
    partners: [],
    outlets: [],
    memberships: [],
    checkRequests: [],
    documentVersions: [],
    acceptances: [],
    integrations: [],
    sandboxTestRuns: [],
    offers: [],
    offerVersions: [],
    commissionPolicies: [],
    codeBatches: [],
    couponCodes: [],
    campaignRequests: [],
    orders: [],
    statusHistory: [],
    settlements: [],
    settlementLines: [],
    discrepancies: [],
    supportCases: [],
    supportMessages: [],
    notifications: [],
    events: [],
    idempotencyKeys: {},
  }
}
