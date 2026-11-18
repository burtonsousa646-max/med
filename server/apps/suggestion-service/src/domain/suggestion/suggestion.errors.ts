// Доменные ошибки без исходных ответов провайдера и значений запроса.

/**
 * Запрос нарушает входные инварианты; на gRPC-границе преобразуется в INVALID_ARGUMENT.
 */
export class InvalidQueryError extends Error {
  /** Создаёт ошибку без включения пользовательского ввода в сообщение. */
  constructor() {
    super('Некорректный запрос подсказок')
  }
}

/**
 * Источник недоступен или вернул непригодный ответ; на gRPC-границе это UNAVAILABLE.
 * reason содержит только безопасную категорию для диагностики, без тела ответа и секретов.
 */
export class SourceUnavailableError extends Error {
  /** Сохраняет категорию отказа для диагностики, без исходного исключения провайдера. */
  constructor(
    readonly reason: 'network' | 'timeout' | 'status' | 'quota' | 'protocol' | 'response_limit',
  ) {
    super('Источник подсказок недоступен')
  }
}

/**
 * Поиск остановлен отменой или исчерпанием дедлайна; на gRPC-границе это CANCELLED.
 */
export class OperationCancelledError extends Error {
  /** Создаёт единую ошибку остановки независимо от источника сигнала отмены. */
  constructor() {
    super('Операция отменена')
  }
}
