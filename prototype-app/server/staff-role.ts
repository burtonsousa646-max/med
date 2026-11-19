import type { V4StaffSession } from '../shared/v4-staff.ts'
import { normalizeCampaignEmail } from '../shared/campaign-draft.ts'
import { v4StaffAddresses, v4StaffAdministrators } from './v4-staff-addresses.ts'
import { db } from './db.ts'

export function configuredRoles(addresses: readonly string[], administrators: readonly string[]) {
  const roles = new Map<string, V4StaffSession['role']>()
  for (const [role, emails] of [['staff', addresses], ['admin', administrators]] as const) {
    for (const value of emails) {
      const email = normalizeCampaignEmail(value).toLowerCase()
      if (email) roles.set(email, role)
    }
  }
  return roles
}

const configured = configuredRoles(v4StaffAddresses, v4StaffAdministrators)
const member = db.prepare('select 1 from v4_staff_members where email=?')
export function roleForEmail(email: string, roles = configured): V4StaffSession['role'] | undefined {
  return roles.get(email) ?? (member.get(email) ? 'staff' : undefined)
}
export const staffRole = (email: string) => roleForEmail(email)
