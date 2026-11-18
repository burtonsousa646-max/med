// Необязательный кеш. Вид запроса нужен для проверки прочитанной модели.
import type { SuggestionQuery, Suggestion } from '../../domain/suggestion'

/**
 * Необязательное хранилище нормализованных результатов. Ошибки ввода-вывода обрабатывает сценарий.
 */
export interface SuggestionCache {
  /**
   * Возвращает список, включая пустой, либо undefined при промахе.
   * query определяет модель проверки; signal ограничивает ожидание операции.
   */
  get(key: string, signal: AbortSignal, query: SuggestionQuery): Promise<Suggestion[] | undefined>

  /**
   * Записывает успешный результат, включая [], с TTL в секундах; учитывает отмену вызова.
   */
  set(key: string, items: Suggestion[], ttlSec: number, signal: AbortSignal): Promise<void>
}
