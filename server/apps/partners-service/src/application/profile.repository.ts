/** Данные представителя до регистрации организации. */
export interface Profile {
  userId: string
  contactEmail?: string
  phone?: string
}

/** Возвращает исходные параметры регистрации даже при последующем изменении контактов. */
export interface ProfileRepository {
  ensure(
    registrationId: string,
    email: string,
    newUserId: string,
  ): Promise<{ id: string; registrationEmail: string }>
  find(userId: string): Promise<Profile | null>
}
