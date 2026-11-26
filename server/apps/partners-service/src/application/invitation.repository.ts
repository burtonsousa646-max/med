/** Стабильный результат создания приглашения. */
export interface InvitationReceipt {
  id: string
  expiresAt: Date
}

/** Транзакционные операции над приглашением и членством получателя. */
export interface InvitationRepository {
  create(actor: string, email: string, id: string): Promise<InvitationReceipt>
  accept(actor: string, email: string, id: string): Promise<void>
  revoke(actor: string, id: string): Promise<void>
}
