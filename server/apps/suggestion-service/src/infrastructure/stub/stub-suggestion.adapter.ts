// Синтетические справочники для разработки и проверок без сети и ключей DaData.
import {
  SuggestionQuery,
  type SuggestionKind,
  sanitize,
  type Suggestion,
} from '../../domain/suggestion'

import type { SuggestionProvider } from '../../application/ports'

/**
 * Синтетические варианты для локального поиска; не являются копией реальных справочников.
 */
export const STUB_DATA: Record<SuggestionKind, Suggestion[]> = {
  party: [
    {
      value: 'ООО Пример Тест',
      inn: '0000000000',
      kpp: '000000000',
      ogrn: '0000000000000',
      address: 'г Пример, ул Тестовая, д 1',
      status: 'active',
    },
    { value: 'ИП Пример Тест', inn: '000000000000', ogrn: '000000000000000', status: 'active' },
  ],
  address: [
    {
      value: 'Тестовый регион, г Пример, ул Тестовая, д 1',
      region: 'Тестовый регион',
      city: 'г Пример',
      street: 'ул Тестовая',
      house: '1',
    },
  ],
  bank: [
    { value: 'Банк Пример Тест', bic: '000000000', correspondentAccount: '00000000000000000000' },
  ],
  email: [{ value: 'qa@example.test' }],
}

/**
 * Локальный источник без сети и ключей. Ищет подстроку по строковым полям фикстур.
 */
export class StubSuggestionAdapter implements SuggestionProvider {
  readonly name = 'stub' as const

  /**
   * Проверяет отмену до поиска, сопоставляет без учёта регистра и возвращает очищенные модели.
   * Порядок соответствует фикстурам; краткость ввода и итоговый лимит контролирует сценарий.
   */
  suggest(query: SuggestionQuery, signal: AbortSignal): Promise<Suggestion[]> {
    signal.throwIfAborted()
    const needle = query.value.toLowerCase()

    return Promise.resolve(
      STUB_DATA[query.kind]
        .filter((item) =>
          Object.values(item).some(
            (value: unknown) => typeof value === 'string' && value.toLowerCase().includes(needle),
          ),
        )
        .map((item) => sanitize(query.kind, item)),
    )
  }
}
