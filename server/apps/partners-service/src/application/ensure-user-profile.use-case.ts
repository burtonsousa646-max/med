import { randomUUIDv7 } from 'node:crypto'
import { checkedId, ProfileError, registrationEmail } from '../domain'
import type { ProfileRepository } from './profile.repository.ts'

/** Создаёт профиль без членства либо восстанавливает результат подтверждённой регистрации. */
export class EnsureUserProfile {
  /** Получает доступ к единственному владельцу профилей. */
  constructor(private readonly profiles: ProfileRepository) {}

  /** Проверяет исходный адрес и возвращает стабильный идентификатор. */
  async execute(key: string, address: string): Promise<string> {
    const email = registrationEmail(address)
    const profile = await this.profiles.ensure(checkedId(key), email, randomUUIDv7())
    if (profile.registrationEmail !== email) throw new ProfileError('registration_conflict')
    return profile.id
  }
}
