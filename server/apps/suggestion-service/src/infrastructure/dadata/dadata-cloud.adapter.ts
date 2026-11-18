// Адаптер связывает транспорт DaData с преобразованием ответа в модель платформы.
import type { SuggestionProvider } from '../../application/ports'
import { SuggestionQuery } from '../../domain/suggestion'
import type { DadataTransport } from './dadata-http.client.types.ts'
import { mapDadata } from './dadata.mapper.ts'

/**
 * Общий адаптер для облачного транспорта и заглушки внутренней DaData.
 * Преобразование протокола в доменную модель одинаково для обоих источников.
 */
export class DadataAdapter implements SuggestionProvider {
  /** Связывает безопасное имя источника с транспортом, выполняющим протокол DaData. */
  constructor(
    readonly name: 'dadata-cloud' | 'dadata-onprem-stub',
    private readonly transport: DadataTransport,
  ) {}

  /**
   * Запрашивает десять вариантов и преобразует envelope DaData; ошибки транспорта не перехватывает.
   */
  async suggest(query: SuggestionQuery, signal: AbortSignal) {
    return mapDadata(
      query.kind,
      await this.transport.post(query.kind, { query: query.value, count: 10 }, signal),
    )
  }
}
