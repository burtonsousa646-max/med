import type { SuggestionKind } from './suggestion-query.value.types.ts'

/**
 * Географическая точка: широта ±90°, долгота ±180°, только конечные числа.
 */
export interface Coordinates {
  latitude: number
  longitude: number
}

/**
 * Подсказка организации или ИП. Реквизиты необязательны и остаются строками.
 */
export interface PartySuggestion {
  value: string
  inn?: string
  kpp?: string
  ogrn?: string
  address?: string
  status?: string
}

/**
 * Адрес с полным отображаемым значением и доступными структурированными частями.
 */
export interface AddressSuggestion {
  value: string
  region?: string
  district?: string
  city?: string
  settlement?: string
  street?: string
  house?: string
  block?: string
  flat?: string
  postalCode?: string
  fiasId?: string
  coordinates?: Coordinates
}

/**
 * Банк с доступными реквизитами; ведущие нули в БИК и счёте сохраняются.
 */
export interface BankSuggestion {
  value: string
  bic?: string
  correspondentAccount?: string
  address?: string
}

/**
 * Подсказка электронной почты; дополнительных сведений об адресате нет.
 */
export interface EmailSuggestion {
  value: string
}

/**
 * Связь вида справочника с моделью результата для типизированного сценария поиска.
 */
export interface SuggestionByKind {
  party: PartySuggestion
  address: AddressSuggestion
  bank: BankSuggestion
  email: EmailSuggestion
}

/**
 * Объединение моделей для общих портов источника и кеша.
 */
export type Suggestion = SuggestionByKind[SuggestionKind]
