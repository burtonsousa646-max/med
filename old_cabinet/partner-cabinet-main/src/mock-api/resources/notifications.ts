import { db, persist } from '../db'
import { networkLatency } from '../client'
import type { Notification } from '../types'

export async function listNotifications(partnerId: string): Promise<Notification[]> {
  await networkLatency()
  return db.notifications
    .filter((n) => n.partnerId === partnerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function markRead(notificationId: string): Promise<Notification> {
  await networkLatency()
  const notification = db.notifications.find((n) => n.id === notificationId)
  if (notification && !notification.readAt) {
    notification.readAt = new Date().toISOString()
    persist()
  }
  return notification!
}

export async function markAllRead(partnerId: string): Promise<void> {
  await networkLatency()
  const now = new Date().toISOString()
  for (const n of db.notifications) {
    if (n.partnerId === partnerId && !n.readAt) n.readAt = now
  }
  persist()
}
