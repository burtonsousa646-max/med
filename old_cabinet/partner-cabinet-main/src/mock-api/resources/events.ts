import { db } from '../db'
import type { DomainEvent } from '../types'

let counter = db.events.length

export function logEvent(input: Omit<DomainEvent, 'id' | 'occurredAt'> & { occurredAt?: string }): DomainEvent {
  counter += 1
  const event: DomainEvent = {
    id: `evt-${Date.now()}-${counter}`,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...input,
  }
  db.events.push(event)
  return event
}

export function notify(input: {
  partnerId: string | null
  severity: 'critical' | 'normal'
  title: string
  entityType: string
  entityId: string
}): void {
  db.notifications.push({
    id: `ntf-${Date.now()}-${db.notifications.length}`,
    ...input,
    readAt: null,
    createdAt: new Date().toISOString(),
  })
}
