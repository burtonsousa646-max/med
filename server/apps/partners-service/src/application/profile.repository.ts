export interface Organization {
  organizationId: string
  inn: string
  customerName?: string
}

/** Текущие контакты и членство подтверждённого пользователя. */
export interface Profile {
  userId: string
  contactEmail?: string
  phone?: string
  organization: Organization | undefined
  canInvite: boolean
}

/** Возвращает исходные параметры регистрации даже при последующем изменении контактов. */
export interface ProfileRepository {
  ensure(
    registrationId: string,
    email: string,
    newUserId: string,
  ): Promise<{ id: string; registrationEmail: string }>
  resolveOrganization(userId: string, inn: string, customerName?: string): Promise<Organization>
  find(userId: string, organizationId?: string): Promise<Profile | null>
}
