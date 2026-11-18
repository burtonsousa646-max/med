/**
 * Ошибка API в едином формате контракта — ai/rules/api-contracts.md, раздел «Ошибки».
 * Совпадает со схемой `Error` в api/openapi/*.yaml.
 */
export interface ApiError {
  /** Машинный код ошибки в lower_snake_case — для логики. */
  code: string
  /** Текст для человека на русском — показывается как есть. */
  message: string
  details?: Record<string, unknown>
}

/**
 * Исключение, в которое `unwrap` превращает ошибку из контракта,
 * чтобы TanStack Query перевёл запрос в состояние ошибки.
 */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError'

  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message)
  }

  get code(): string {
    return this.body.code
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError
}

const UNKNOWN_ERROR: ApiError = {
  code: 'unknown_error',
  message: 'Что-то пошло не так. Попробуйте ещё раз.',
}

/** Приводит тело ошибки к формату `ApiError`, даже если сервер ответил не по контракту. */
export function toApiError(body: unknown): ApiError {
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    'message' in body &&
    typeof body.code === 'string' &&
    typeof body.message === 'string'
  ) {
    return body as ApiError
  }
  return UNKNOWN_ERROR
}
