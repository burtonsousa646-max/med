import type { KINDS } from './suggestion-query.value.ts'

/**
 * Ключ справочника; не зависит от HTTP-маршрутов и имён методов gRPC.
 */
export type SuggestionKind = (typeof KINDS)[number]
