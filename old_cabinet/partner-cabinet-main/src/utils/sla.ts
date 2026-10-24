/** Ориентир SLA модерации оффера — часов до превышения ожидания (демо-число, не
 *  подтверждённый SLA, см. MED_HANDOFF/05_INTEGRATION_SPEC.md §SLA/observability: OPEN). */
export const MODERATION_SLA_HOURS = 48

export interface ModerationWaitInfo {
  hours: number
  label: string
  overdue: boolean
}

export function moderationWait(sinceIso: string): ModerationWaitInfo {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / (60 * 60 * 1000)))
  const label =
    hours < 1
      ? 'меньше часа'
      : hours < 24
        ? `${hours} ч`
        : `${Math.floor(hours / 24)} дн ${hours % 24 ? `${hours % 24} ч` : ''}`.trim()
  return { hours, label, overdue: hours > MODERATION_SLA_HOURS }
}
