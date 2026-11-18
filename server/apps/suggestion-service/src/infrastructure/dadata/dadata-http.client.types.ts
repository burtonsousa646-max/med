import type { SuggestionKind } from '../../domain/suggestion'

/**
 * Транспорт протокола DaData; позволяет заменить HTTP внутренней заглушкой без смены mapper.
 */
export interface DadataTransport {
  /**
   * Принимает вид справочника и тело поиска, возвращает ещё не проверенный JSON-ответ.
   * Сигнал распространяет отмену вызывающей операции на транспорт.
   */
  post(
    kind: SuggestionKind,
    body: { query: string; count: number },
    signal: AbortSignal,
  ): Promise<unknown>
}
