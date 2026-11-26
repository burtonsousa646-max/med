/** Незавершённая регистрация хранит постоянный ключ, завершённая также содержит userId. */
export interface EmailIdentity {
  subject: string
  registrationId: string
  userId: string | null
}

/** Привязка может перейти из ожидающей в завершённую только с одним userId. */
export interface RegistrationStore {
  bind(registrationId: string, userId: string): Promise<void>
  claimPending(): Promise<EmailIdentity | null>
}

/** Владелец профиля восстанавливает прежний результат по ключу регистрации. */
export interface PartnerProfiles {
  ensure(registrationId: string, verifiedEmail: string): Promise<string>
}
