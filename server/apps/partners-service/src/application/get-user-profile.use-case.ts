import { checkedId, ProfileError } from '../domain'
import type { ProfileRepository } from './profile.repository.ts'

/** Возвращает актуальные контакты пользователя, чью личность подтвердил Gateway. */
export class GetUserProfile {
  constructor(private readonly profiles: ProfileRepository) {}

  /** Отсутствующий профиль возвращается вызывающему как доменная ошибка. */
  async execute(userId: string) {
    const profile = await this.profiles.find(checkedId(userId))
    if (!profile) throw new ProfileError('not_found')
    return profile
  }
}
