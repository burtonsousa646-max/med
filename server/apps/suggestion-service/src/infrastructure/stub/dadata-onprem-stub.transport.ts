// Заглушка внутренней DaData возвращает облачный envelope для общего mapper.
import {
  SuggestionQuery,
  type SuggestionKind,
  type Suggestion,
  type PartySuggestion,
  type AddressSuggestion,
  type BankSuggestion,
} from '../../domain/suggestion'

import type { DadataTransport } from '../dadata'
import { StubSuggestionAdapter } from './stub-suggestion.adapter.ts'

/**
 * Имитация внутренней DaData на синтетических данных в формате облачного протокола.
 * Позволяет использовать общий DadataAdapter; реальных сетевых запросов не выполняет.
 */
export class OnPremStubTransport implements DadataTransport {
  private readonly stub = new StubSuggestionAdapter()

  /**
   * Оборачивает результаты локального источника в suggestions/data для общего mapper.
   * count принимается для совместимости интерфейса; размер здесь задаётся фикстурами.
   */
  async post(kind: SuggestionKind, body: { query: string; count: number }, signal: AbortSignal) {
    const query = new SuggestionQuery(kind, body.query)
    const items = await this.stub.suggest(query, signal)

    return {
      suggestions: items.map((item) => ({
        value: item.value,
        unrestricted_value: item.value,
        data: toDadataFields(kind, item),
      })),
    }
  }
}

/**
 * Переводит доступные поля синтетического варианта в имена DaData.
 * kind должен соответствовать модели item — это обеспечивает выбор справочника в post.
 */
function toDadataFields(kind: SuggestionKind, item: Suggestion): Record<string, unknown> {
  switch (kind) {
    case 'party': {
      const party = item as PartySuggestion
      return {
        inn: party.inn,
        kpp: party.kpp,
        ogrn: party.ogrn,
        address: party.address ? { value: party.address } : undefined,
        state: { status: party.status?.toUpperCase() },
      }
    }

    case 'address': {
      const address = item as AddressSuggestion
      return {
        region_with_type: address.region,
        city_with_type: address.city,
        street_with_type: address.street,
        house: address.house,
      }
    }

    case 'bank': {
      const bank = item as BankSuggestion
      return { bic: bank.bic, correspondent_account: bank.correspondentAccount }
    }

    case 'email':
      return {}
  }
}
