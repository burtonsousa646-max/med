import { db, persist } from './db'
import { intBetween, mulberry32 } from '@/utils/rng'

/** Единый конверт ошибки. SOURCE: MED_HANDOFF/05_INTEGRATION_SPEC.md §Ошибки/limits. */
export interface ApiError {
  code: string
  message: string
  requestId: string
  retryable: boolean
  fieldErrors?: Record<string, string>
}

export class ApiRequestError extends Error {
  code: string
  requestId: string
  retryable: boolean
  fieldErrors?: Record<string, string>
  constructor(err: ApiError) {
    super(err.message)
    this.name = 'ApiRequestError'
    this.code = err.code
    this.requestId = err.requestId
    this.retryable = err.retryable
    this.fieldErrors = err.fieldErrors
  }
}

function requestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}`
}

export function apiError(
  code: string,
  message: string,
  opts: { retryable?: boolean; fieldErrors?: Record<string, string> } = {},
): ApiRequestError {
  return new ApiRequestError({
    code,
    message,
    requestId: requestId(),
    retryable: opts.retryable ?? false,
    fieldErrors: opts.fieldErrors,
  })
}

const jitterRnd = mulberry32(Date.now() & 0xffffffff)

/** Симулирует сетевую задержку реального API (200–600мс), чтобы UI honestly показывал
 *  состояния loading, а не мгновенно рендерил mock-данные. */
export function networkLatency(): Promise<void> {
  const ms = intBetween(jitterRnd, 180, 620)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hashPayload(payload: unknown): string {
  const str = JSON.stringify(payload ?? null)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

/**
 * Идемпотентность мутирующих вызовов. SOURCE: MED_HANDOFF/05_INTEGRATION_SPEC.md §Идемпотентность.
 * Повтор с тем же ключом и тем же payload возвращает сохранённый ответ; тот же ключ
 * с другим payload — 409 IDEMPOTENCY_CONFLICT.
 */
export function withIdempotency<T>(key: string | undefined, payload: unknown, run: () => T): T {
  if (!key) return run()

  const payloadHash = hashPayload(payload)
  const existing = db.idempotencyKeys[key]
  if (existing) {
    if (existing.payloadHash === payloadHash) {
      return existing.response as T
    }
    throw apiError('IDEMPOTENCY_CONFLICT', 'Ключ идемпотентности уже использован с другим содержимым запроса')
  }

  const response = run()
  db.idempotencyKeys[key] = { payloadHash, response }
  persist()
  return response
}
