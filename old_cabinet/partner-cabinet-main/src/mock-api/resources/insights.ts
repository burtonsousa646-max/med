import { db, persist } from '../db'
import { networkLatency } from '../client'

const DAY_MS = 24 * 60 * 60 * 1000

/** Не плодит повтор: пропускает генерацию, если уведомление с тем же типом сущности
 *  уже создавалось за последние 7 дней (даже если партнёр его прочитал). */
function alreadyNotifiedRecently(partnerId: string, entityType: string, entityId: string, sinceMs: number): boolean {
  return db.notifications.some(
    (n) =>
      n.partnerId === partnerId &&
      n.entityType === entityType &&
      n.entityId === entityId &&
      new Date(n.createdAt).getTime() > sinceMs,
  )
}

function pushInsight(input: { partnerId: string; severity: 'critical' | 'normal'; title: string; entityType: string; entityId: string }) {
  db.notifications.push({
    id: `ntf-insight-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    readAt: null,
    createdAt: new Date().toISOString(),
  })
}

export interface InsightsResult {
  generated: number
}

/**
 * Проактивные подсказки по метрикам партнёра — превращают кабинет из формы в инструмент
 * роста: истекающие офферы, падение конверсии, кандидаты на апгрейд интеграции.
 * Идемпотентно: безопасно вызывать при каждом заходе на Обзор.
 */
export async function generatePartnerInsights(partnerId: string): Promise<InsightsResult> {
  await networkLatency()
  const now = Date.now()
  const weekAgoMs = now - 7 * DAY_MS
  let generated = 0

  // 1) Опубликованные офферы, истекающие в течение 7 дней
  const offers = db.offers.filter((o) => o.partnerId === partnerId && o.lifecycleStatus === 'published')
  for (const offer of offers) {
    const version = db.offerVersions.find((v) => v.offerId === offer.id && v.revision === offer.currentLiveVersion)
    if (!version) continue
    const daysLeft = Math.ceil((new Date(version.endDate).getTime() - now) / DAY_MS)
    if (daysLeft >= 0 && daysLeft <= 7 && !alreadyNotifiedRecently(partnerId, 'offer', offer.id, weekAgoMs)) {
      pushInsight({
        partnerId,
        severity: daysLeft <= 2 ? 'critical' : 'normal',
        title: `Оффер «${offer.title}» истекает через ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'} — продлите срок действия`,
        entityType: 'offer',
        entityId: offer.id,
      })
      generated++
    }
  }

  // 2) Падение конверсии: последние 14 дней vs предыдущие 14 дней
  const orders = db.orders.filter((o) => o.partnerId === partnerId && o.environment === 'production')
  const period = (fromDays: number, toDays: number) =>
    orders.filter((o) => {
      const age = now - new Date(o.createdAt).getTime()
      return age >= toDays * DAY_MS && age < fromDays * DAY_MS
    })
  const recent = period(14, 0)
  const previous = period(28, 14)
  const confirmedRate = (list: typeof orders) =>
    list.length ? list.filter((o) => o.lifecycleStatus !== 'created' && o.lifecycleStatus !== 'cancelled').length / list.length : null
  const recentRate = confirmedRate(recent)
  const previousRate = confirmedRate(previous)
  if (
    recentRate !== null &&
    previousRate !== null &&
    previous.length >= 5 &&
    previousRate > 0 &&
    recentRate < previousRate * 0.75 &&
    !alreadyNotifiedRecently(partnerId, 'conversion_drop', partnerId, weekAgoMs)
  ) {
    const dropPct = Math.round((1 - recentRate / previousRate) * 100)
    pushInsight({
      partnerId,
      severity: 'normal',
      title: `Конверсия в подтверждение заказа упала на ${dropPct}% за последние 2 недели — проверьте условия офферов`,
      entityType: 'conversion_drop',
      entityId: partnerId,
    })
    generated++
  }

  // 3) Кандидат на апгрейд интеграции: много заказов вручную (L0) за месяц
  const monthOrders = orders.filter((o) => now - new Date(o.createdAt).getTime() < 30 * DAY_MS)
  const integration = db.integrations.find((i) => i.partnerId === partnerId)
  if (
    integration?.level === 'L0' &&
    monthOrders.length >= 20 &&
    !alreadyNotifiedRecently(partnerId, 'integration_upgrade', partnerId, weekAgoMs)
  ) {
    pushInsight({
      partnerId,
      severity: 'normal',
      title: `За месяц ${monthOrders.length} заказов обработано вручную (уровень L0) — рассмотрите интеграцию L1 для автоматизации`,
      entityType: 'integration_upgrade',
      entityId: partnerId,
    })
    generated++
  }

  if (generated > 0) persist()
  return { generated }
}
