import { db } from '../db'
import { networkLatency } from '../client'
import type { DomainEvent } from '../types'

export interface KamContact {
  displayName: string
  email: string
}

export interface DashboardSummary {
  activeOffers: number
  openOrders: number
  openDisputes: number
  payableMinor: number
  kam: KamContact | null
  onboarding: {
    organizationSaved: boolean
    checkApproved: boolean
    agreementAccepted: boolean
    integrationConfigured: boolean
    firstOfferPublished: boolean
  }
  recentEvents: DomainEvent[]
}

export async function getDashboardSummary(partnerId: string): Promise<DashboardSummary> {
  await networkLatency()
  const partner = db.partners.find((p) => p.id === partnerId)
  const offers = db.offers.filter((o) => o.partnerId === partnerId)
  const orders = db.orders.filter((o) => o.partnerId === partnerId)
  const settlements = db.settlements.filter((s) => s.partnerId === partnerId)
  const effectiveOffer = db.documentVersions.find((d) => d.type === 'offer_agreement' && d.status === 'effective')
  const hasAcceptance = effectiveOffer
    ? db.acceptances.some((a) => a.partnerId === partnerId && a.documentVersionId === effectiveOffer.id)
    : false
  const integration = db.integrations.find((i) => i.partnerId === partnerId)
  const kamMembership = partner?.kamUserId ? db.memberships.find((m) => m.id === partner.kamUserId) : undefined

  return {
    activeOffers: offers.filter((o) => o.lifecycleStatus === 'published').length,
    openOrders: orders.filter((o) => o.lifecycleStatus === 'created' || o.lifecycleStatus === 'confirmed').length,
    openDisputes: orders.filter((o) => o.disputeStatus === 'open').length,
    payableMinor: settlements
      .filter((s) => s.status !== 'paid')
      .reduce((sum, s) => sum + s.payableMinor, 0),
    kam: kamMembership ? { displayName: kamMembership.displayName, email: kamMembership.email } : null,
    onboarding: {
      organizationSaved: !!partner,
      checkApproved: partner?.lifecycleStatus === 'approved' || partner?.lifecycleStatus === 'active',
      agreementAccepted: hasAcceptance,
      integrationConfigured: !!integration && integration.lifecycleStatus !== 'not_configured',
      firstOfferPublished: offers.some((o) => o.lifecycleStatus === 'published'),
    },
    recentEvents: db.events
      .filter((e) => e.partnerId === partnerId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 8),
  }
}
