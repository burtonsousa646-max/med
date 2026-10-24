/** Роли партнёрской стороны (SOURCE: MED_HANDOFF/12_ROLES_PERMISSIONS.md) */
export type PartnerRole =
  | 'owner'
  | 'offer_editor'
  | 'orders_ops'
  | 'finance'
  | 'developer'
  | 'viewer'

/** Роли внутренних сотрудников Билайна */
export type InternalRole = 'kam' | 'moderator' | 'finance_internal' | 'compliance'

export type Role = PartnerRole | InternalRole

export type SessionScope = 'partner' | 'internal'

export interface DemoIdentity {
  id: string
  displayName: string
  scope: SessionScope
  role: Role
  /** Для partner-сессии — id организации-партнёра, к которой привязан пользователь */
  partnerId?: string
}
