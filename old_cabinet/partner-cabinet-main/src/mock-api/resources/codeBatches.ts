import { db, persist } from '../db'
import { networkLatency, apiError } from '../client'
import type { CodeBatch, CouponCode } from '../types'
import { logEvent } from './events'

export async function listCodeBatches(offerVersionId: string): Promise<CodeBatch[]> {
  await networkLatency()
  return db.codeBatches.filter((b) => b.offerVersionId === offerVersionId)
}

export async function listCodes(batchId: string): Promise<CouponCode[]> {
  await networkLatency()
  return db.couponCodes.filter((c) => c.batchId === batchId)
}

export interface CodePreviewRow {
  code: string
  rowNumber: number
  error: string | null
}

/** Предпросмотр CSV перед commit: находит дубли внутри партии и с уже существующими
 *  кодами партнёра — до фактической записи в базу (SOURCE: 04_PARTNER_CABINET_SPEC.md). */
export function previewCodes(partnerId: string, rawCodes: string[]): CodePreviewRow[] {
  const existing = new Set(
    db.couponCodes
      .filter((c) => db.codeBatches.find((b) => b.id === c.batchId)?.partnerId === partnerId)
      .map((c) => c.code.trim().toUpperCase()),
  )
  const seenInBatch = new Set<string>()
  return rawCodes.map((raw, i) => {
    const code = raw.trim()
    const normalized = code.toUpperCase()
    let error: string | null = null
    if (!code) error = 'Пустая строка'
    else if (seenInBatch.has(normalized)) error = 'Дубль внутри загружаемой партии'
    else if (existing.has(normalized)) error = 'Такой код уже используется у партнёра'
    seenInBatch.add(normalized)
    return { code, rowNumber: i + 1, error }
  })
}

export async function commitCodeBatch(input: {
  offerVersionId: string
  partnerId: string
  codes: string[]
  expiresAt: string
}): Promise<CodeBatch> {
  await networkLatency()
  const preview = previewCodes(input.partnerId, input.codes)
  const invalid = preview.filter((r) => r.error)
  if (invalid.length > 0) {
    throw apiError('VALIDATION_FAILED', 'В партии есть невалидные или дублирующиеся коды', {
      fieldErrors: Object.fromEntries(invalid.map((r) => [`row_${r.rowNumber}`, r.error!])),
    })
  }

  const batch: CodeBatch = {
    id: `batch-${crypto.randomUUID().slice(0, 8)}`,
    offerVersionId: input.offerVersionId,
    partnerId: input.partnerId,
    createdAt: new Date().toISOString(),
    totalCodes: input.codes.length,
    expiresAt: input.expiresAt,
  }
  db.codeBatches.push(batch)
  db.couponCodes.push(
    ...input.codes.map(
      (code): CouponCode => ({
        id: `${batch.id}-${crypto.randomUUID().slice(0, 6)}`,
        batchId: batch.id,
        code: code.trim(),
        status: 'available',
        reservedOrderId: null,
      }),
    ),
  )
  logEvent({
    type: 'codes.batch.committed',
    actorId: 'system',
    actorLabel: 'Партнёр',
    partnerId: input.partnerId,
    entityType: 'code_batch',
    entityId: batch.id,
    summary: `Загружено ${input.codes.length} промокодов`,
  })
  persist()
  return batch
}
