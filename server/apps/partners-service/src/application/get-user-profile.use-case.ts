import { checkedId, ProfileError } from '../domain'
import type { ProfileRepository } from './profile.repository.ts'

/** Возвращает актуальные контакты пользователя, чью личность подтвердил Gateway. */
export class GetUserProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  execute(userId: string) {
    return this.read(userId)
  }

  async representative(userId: string, organizationId: string) {
    return this.read(userId, checkedId(organizationId))
  }

  private async read(userId: string, organizationId?: string) {
    const profile = await this.profiles.find(checkedId(userId), organizationId)
    if (!profile) throw new ProfileError('not_found')
    return profile
  }
}
