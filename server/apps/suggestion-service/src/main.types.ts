import type { createSuggestionApp } from './app.ts'

export type SuggestionApplication = Awaited<ReturnType<typeof createSuggestionApp>>
