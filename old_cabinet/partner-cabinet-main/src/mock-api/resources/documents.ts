import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { Acceptance, DocumentType, DocumentVersion } from '../types'
import { logEvent } from './events'
import { maybeActivatePartner } from './partners'

export async function listEffectiveDocuments(type?: DocumentType): Promise<DocumentVersion[]> {
  await networkLatency()
  return db.documentVersions.filter((d) => d.status === 'effective' && (!type || d.type === type))
}

export async function listAcceptances(partnerId: string): Promise<Acceptance[]> {
  await networkLatency()
  return db.acceptances.filter((a) => a.partnerId === partnerId)
}

export async function acceptDocument(input: {
  partnerId: string
  documentVersionId: string
  signatoryId: string
  signatoryLabel: string
  authorityRef: string
}): Promise<Acceptance> {
  await networkLatency()
  const doc = db.documentVersions.find((d) => d.id === input.documentVersionId)
  if (!doc) throw apiError('NOT_FOUND', 'Версия документа не найдена')

  // Повтор акцепта той же версии тем же партнёром не создаёт второй договор.
  const existing = db.acceptances.find(
    (a) => a.partnerId === input.partnerId && a.documentVersionId === input.documentVersionId,
  )
  if (existing) return existing

  const acceptance: Acceptance = {
    id: `acc-${crypto.randomUUID().slice(0, 8)}`,
    ...input,
    acceptedAt: new Date().toISOString(),
  }
  db.acceptances.push(acceptance)
  logEvent({
    type: 'document.accepted',
    actorId: input.signatoryId,
    actorLabel: input.signatoryLabel,
    partnerId: input.partnerId,
    entityType: 'document_version',
    entityId: doc.id,
    summary: `Принята «${doc.title}» (версия ${doc.version})`,
  })

  await maybeActivatePartner(input.partnerId)
  persist()
  return acceptance
}
