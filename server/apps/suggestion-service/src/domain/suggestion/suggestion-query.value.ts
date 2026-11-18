import type { SuggestionKind } from './suggestion-query.value.types.ts'

// Нормализованная строка поиска и её инварианты для всех четырёх видов.
import { InvalidQueryError } from './suggestion.errors.ts'

/**
 * Виды справочников, поддерживаемые доменом и адаптерами источников.
 */
export const KINDS = ['party', 'address', 'bank', 'email'] as const

/**
 * Неизменяемый запрос после удаления пробелов по краям.
 * Длина считается в кодовых точках Unicode; внутренние пробелы сохраняются.
 */
export class SuggestionQuery {
  readonly value: string
  readonly length: number

  /**
   * Проверяет вид справочника, строковый тип и предел в 150 символов после trim.
   * @throws InvalidQueryError При неверном виде, типе или превышении длины.
   */
  constructor(
    readonly kind: SuggestionKind,
    raw: unknown,
  ) {
    if (!KINDS.includes(kind) || typeof raw !== 'string') throw new InvalidQueryError()
    this.value = raw.trim()
    this.length = Array.from(this.value).length
    if (this.length > 150) throw new InvalidQueryError()
    Object.freeze(this)
  }

  /**
   * Признак ввода короче трёх символов: сценарий вернёт [] без обращения к зависимостям.
   */
  get empty(): boolean {
    return this.length < 3
  }
}
