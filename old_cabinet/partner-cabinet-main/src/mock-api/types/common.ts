/**
 * Общие типы канонической модели.
 * SOURCE: MED_HANDOFF/07_DATA_MODEL.md — "Общие поля: id UUID, created_at/updated_at UTC,
 * version integer; денежные значения BIGINT minor units + currency; float запрещён."
 */

export type UUID = string
export type ISODateTime = string
export type CurrencyCode = 'RUB'

export interface MinorMoney {
  amountMinor: number
  currency: CurrencyCode
}

export interface Versioned {
  version: number
}

export interface Timestamped {
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface TenantOwned {
  partnerId: UUID
}

/** Упрощённый журнал доменных событий — питает уведомления, дашборд и admin-очереди.
 *  Это не полноценные inbox/outbox/DeliveryAttempt из RFC05: во frontend-прототипе
 *  нет реальной доставки вебхуков, поэтому события хранятся только как аудит-лог. */
export interface DomainEvent {
  id: UUID
  type: string
  occurredAt: ISODateTime
  actorId: UUID | 'system'
  actorLabel: string
  partnerId?: UUID
  entityType: string
  entityId: UUID
  summary: string
}

export class InvalidTransitionError extends Error {
  code = 'INVALID_TRANSITION' as const
  entity: string
  from: string
  action: string
  constructor(entity: string, from: string, action: string) {
    super(`Недопустимый переход: ${entity} из состояния "${from}" не поддерживает действие "${action}"`)
    this.name = 'InvalidTransitionError'
    this.entity = entity
    this.from = from
    this.action = action
  }
}

export class VersionConflictError extends Error {
  code = 'VERSION_CONFLICT' as const
  constructor(entity: string) {
    super(`Конфликт версий: ${entity} был изменён параллельно, обновите данные и повторите`)
    this.name = 'VersionConflictError'
  }
}

export class ForbiddenActionError extends Error {
  code = 'FORBIDDEN' as const
  constructor(action: string) {
    super(`Действие "${action}" недоступно для текущей роли`)
    this.name = 'ForbiddenActionError'
  }
}
