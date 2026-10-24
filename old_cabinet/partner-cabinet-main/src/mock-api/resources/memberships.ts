import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { Membership } from '../types'
import type { Role, SessionScope } from '@/types/session'

export async function listMemberships(partnerId: string | null): Promise<Membership[]> {
  await networkLatency()
  return db.memberships.filter((m) => m.partnerId === partnerId)
}

export interface MembershipWithPartner extends Membership {
  partnerName: string | null
}

/** Все пользователи платформы (seed-демо + все, кто прошёл регистрацию через онбординг) —
 *  используется страницей входа и переключателем ролей, чтобы новый партнёр не терялся. */
export async function listAllMemberships(): Promise<MembershipWithPartner[]> {
  await networkLatency()
  return db.memberships
    .filter((m) => m.status === 'active')
    .map((m) => ({
      ...m,
      partnerName: m.partnerId ? (db.partners.find((p) => p.id === m.partnerId)?.legalName ?? null) : null,
    }))
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt))
}

export interface CreateMembershipInput {
  partnerId: string | null
  userId: string
  displayName: string
  email: string
  scope: SessionScope
  role: Role
}

export async function createMembership(input: CreateMembershipInput): Promise<Membership> {
  await networkLatency()
  const membership: Membership = {
    id: input.userId,
    ...input,
    status: 'active',
    invitedAt: new Date().toISOString(),
  }
  db.memberships.push(membership)
  persist()
  return membership
}

export async function updateMembershipRole(membershipId: string, role: Role): Promise<Membership> {
  await networkLatency()
  const membership = db.memberships.find((m) => m.id === membershipId)
  if (!membership) throw apiError('NOT_FOUND', 'Пользователь не найден')
  membership.role = role
  persist()
  return membership
}

/** Нельзя удалить/заблокировать последнего owner партнёра. */
export async function blockMembership(membershipId: string): Promise<Membership> {
  await networkLatency()
  const membership = db.memberships.find((m) => m.id === membershipId)
  if (!membership) throw apiError('NOT_FOUND', 'Пользователь не найден')

  if (membership.role === 'owner') {
    const activeOwners = db.memberships.filter(
      (m) => m.partnerId === membership.partnerId && m.role === 'owner' && m.status === 'active',
    )
    if (activeOwners.length <= 1) {
      throw apiError('LAST_OWNER_PROTECTED', 'Нельзя заблокировать последнего владельца партнёра')
    }
  }

  membership.status = 'blocked'
  persist()
  return membership
}

export async function unblockMembership(membershipId: string): Promise<Membership> {
  await networkLatency()
  const membership = db.memberships.find((m) => m.id === membershipId)
  if (!membership) throw apiError('NOT_FOUND', 'Пользователь не найден')
  membership.status = 'active'
  persist()
  return membership
}
