import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { Outlet } from '../types'

export async function listOutlets(partnerId: string): Promise<Outlet[]> {
  await networkLatency()
  return db.outlets.filter((o) => o.partnerId === partnerId)
}

export interface CreateOutletInput {
  partnerId: string
  name: string
  address: string
  online: boolean
  timezone: string
  hours: string
}

export async function createOutlet(input: CreateOutletInput): Promise<Outlet> {
  await networkLatency()
  const now = new Date().toISOString()
  const outlet: Outlet = {
    id: `out-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  db.outlets.push(outlet)
  persist()
  return outlet
}

export async function closeOutlet(outletId: string): Promise<Outlet> {
  await networkLatency()
  const outlet = db.outlets.find((o) => o.id === outletId)
  if (!outlet) throw apiError('NOT_FOUND', 'Точка не найдена')
  outlet.status = 'closed'
  outlet.updatedAt = new Date().toISOString()
  persist()
  return outlet
}
