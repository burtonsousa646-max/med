import { checkedId } from '../domain'
import type { ProfileRepository } from './profile.repository.ts'

/** Разрешает организацию для оформления кампании по подтверждённому профилю. */
export class ResolveCampaignOrganization {
  constructor(private readonly profiles: ProfileRepository) {}

  execute(userId: string, inn: string, customerName?: string) {
    return this.profiles.resolveOrganization(checkedId(userId), inn, customerName)
  }
}
