// Диагностика получает только категории событий, без ввода, ответов и секретов.
import type { SuggestionKind } from '../../domain/suggestion'

/**
 * Порт безопасных диагностических событий; значения запроса и ответа передавать запрещено.
 */
export interface Diagnostics {
  /**
   * Регистрирует категорию результата для вида справочника и источника; может подавлять повторы.
   */
  record(result: string, kind: SuggestionKind, provider: string): void
}
