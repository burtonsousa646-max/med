import type { createGateway, createSuggestionApp } from './dependencies'

/** Экземпляр Suggestion с управляемым жизненным циклом для контрактного сценария. */
export type SuggestionService = Awaited<ReturnType<typeof createSuggestionApp>>

/** Экземпляр Gateway с управляемым жизненным циклом для контрактного сценария. */
export type Gateway = Awaited<ReturnType<typeof createGateway>>
