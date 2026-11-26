import { checkedId, registrationEmail } from '../domain'
import type { InvitationRepository } from './invitation.repository.ts'

/** Принимает от Gateway подтверждённую личность и нормализует параметры команды. */
export class Invitations {
  /** Получает хранилище приглашений Partners. */
  constructor(private readonly invitations: InvitationRepository) {}

  /** Проверяет ключ и нормализует адрес приглашённого. */
  async create(actor: string, email: string, key: string) {
    return this.invitations.create(checkedId(actor), registrationEmail(email), checkedId(key))
  }

  /** Использует адрес, подтверждённый в сессии получателя. */
  async accept(actor: string, verifiedEmail: string, id: string) {
    return this.invitations.accept(
      checkedId(actor),
      registrationEmail(verifiedEmail),
      checkedId(id),
    )
  }

  /** Проверяет идентификаторы создателя и приглашения. */
  async revoke(actor: string, id: string) {
    return this.invitations.revoke(checkedId(actor), checkedId(id))
  }
}
