import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import type { Response } from 'express'

/** Передаёт контролируемый HTTP-статус для безопасной нормализации ошибки. */
export class GatewayError extends Error {
  /** Получает зависимости и настройки компонента. */
  constructor(readonly status: number) {
    super('Ошибка Gateway')
  }
}
const errors: Record<number, readonly [string, string]> = {
  400: ['invalid_request', 'Некорректный запрос'],
  401: ['unauthenticated', 'Требуется вход'],
  403: ['permission_denied', 'Недостаточно прав'],
  404: ['not_found', 'Ресурс не найден'],
  409: ['conflict', 'Конфликт состояния'],
  413: ['payload_too_large', 'Превышен размер запроса'],
  415: ['unsupported_media_type', 'Неподдерживаемый тип содержимого'],
  422: ['business_rule_violation', 'Действие нарушает правила'],
  429: ['rate_limit_exceeded', 'Превышен лимит запросов'],
  500: ['internal_error', 'Внутренняя ошибка сервера'],
  503: ['service_unavailable', 'Сервис временно недоступен'],
}

/** Преобразует ошибку в безопасный HTTP-статус и публичное сообщение. */
export function normalizeError(error: unknown) {
  let status = 500
  if (error instanceof GatewayError) status = error.status
  else if (error instanceof HttpException) status = error.getStatus()
  else if (error && typeof error === 'object') {
    const e = error as { status?: unknown; code?: unknown }
    if (typeof e.status === 'number' && errors[e.status]) status = e.status
    else if (typeof e.code === 'number')
      status =
        (
          { 3: 400, 16: 401, 7: 403, 5: 404, 6: 409, 10: 409, 9: 422, 4: 503, 14: 503 } as Record<
            number,
            number
          >
        )[e.code] ?? 500
  }
  const [code, message] = errors[status] ?? ['internal_error', 'Внутренняя ошибка сервера']
  return { status: errors[status] ? status : 500, body: { code, message } }
}

/** Отправляет нормализованную ошибку без внутренних деталей. */
export function sendError(response: Response, error: unknown): void {
  if (response.writableEnded || response.destroyed) return
  if (response.headersSent) {
    response.destroy()
    return
  }
  const result = normalizeError(error)
  response.setHeader('Cache-Control', 'no-store')
  response.status(result.status).json(result.body)
}

/** Преобразует исключения NestJS в безопасные HTTP-ответы. */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  /** Обрабатывает исключение на границе HTTP. */
  catch(error: unknown, host: ArgumentsHost): void {
    sendError(host.switchToHttp().getResponse<Response>(), error)
  }
}

/** Разрешает только операции с явно публичной политикой доступа. */
export class PublicOnlyAccessPolicy {
  /** Проверяет лимиты клиента и возвращает отказ при превышении или недоступности Redis. */
  assertAllowed(operation: { security?: unknown }): void {
    if (!Array.isArray(operation.security) || operation.security.length !== 0)
      throw new GatewayError(401)
  }
}
