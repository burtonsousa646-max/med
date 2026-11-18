// Порт справочника: сценарий не зависит от HTTP-протокола конкретного источника.
import type { SuggestionQuery, Suggestion } from '../../domain/suggestion'

/**
 * Источник нормализованных моделей подсказок; детали протокола остаются в адаптере.
 */
export interface SuggestionProvider {
  /**
   * Безопасный идентификатор источника для диагностики.
   */
  readonly name: 'dadata-cloud' | 'dadata-onprem-stub' | 'stub'

  /**
   * Ищет по нормализованному запросу, сохраняя порядок вариантов источника.
   * Отказы и отмена передаются сценарию исключением; дополнительные поля источника не возвращаются.
   */
  suggest(query: SuggestionQuery, signal: AbortSignal): Promise<Suggestion[]>
}
