import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { SupportCase, SupportMessage } from '../types'
import { logEvent } from './events'

export async function listCases(partnerId: string): Promise<SupportCase[]> {
  await networkLatency()
  return db.supportCases
    .filter((c) => c.partnerId === partnerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listMessages(caseId: string): Promise<SupportMessage[]> {
  await networkLatency()
  return db.supportMessages.filter((m) => m.caseId === caseId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export interface CreateCaseInput {
  partnerId: string
  topic: string
  message: string
  authorLabel: string
}

export async function createCase(input: CreateCaseInput): Promise<SupportCase> {
  await networkLatency()
  const now = new Date().toISOString()
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const kase: SupportCase = {
    id: `case-${crypto.randomUUID().slice(0, 8)}`,
    partnerId: input.partnerId,
    topic: input.topic,
    relatedOrderId: null,
    relatedOfferId: null,
    priority: 'normal',
    ownerLabel: 'Дмитрий Носов',
    dueAt,
    status: 'open',
    createdAt: now,
  }
  db.supportCases.push(kase)
  db.supportMessages.push({
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    caseId: kase.id,
    authorLabel: input.authorLabel,
    authorSide: 'partner',
    text: input.message,
    createdAt: now,
  })
  logEvent({
    type: 'support.case.created',
    actorId: 'system',
    actorLabel: input.authorLabel,
    partnerId: input.partnerId,
    entityType: 'support_case',
    entityId: kase.id,
    summary: `Обращение «${input.topic}» создано`,
  })
  persist()
  return kase
}

export async function postMessage(input: {
  caseId: string
  text: string
  authorLabel: string
  authorSide: 'partner' | 'internal'
}): Promise<SupportMessage> {
  await networkLatency()
  const kase = db.supportCases.find((c) => c.id === input.caseId)
  if (!kase) throw apiError('NOT_FOUND', 'Обращение не найдено')

  const message: SupportMessage = {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    caseId: input.caseId,
    authorLabel: input.authorLabel,
    authorSide: input.authorSide,
    text: input.text,
    createdAt: new Date().toISOString(),
  }
  db.supportMessages.push(message)
  if (kase.status === 'open') kase.status = 'in_progress'
  persist()
  return message
}

export async function resolveCase(caseId: string): Promise<SupportCase> {
  await networkLatency()
  const kase = db.supportCases.find((c) => c.id === caseId)
  if (!kase) throw apiError('NOT_FOUND', 'Обращение не найдено')
  kase.status = 'resolved'
  persist()
  return kase
}
