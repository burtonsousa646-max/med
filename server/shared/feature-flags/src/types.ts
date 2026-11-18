/** Контекст вычисления флага — только идентификаторы из сессии. */
export interface FlagContext {
  userId?: string
  companyId?: string
}

/** То, что нужно сервису: синхронная проверка флага. Реализуют FeatureFlagsClient и InMemoryFeatureFlags. */
export interface FeatureFlagsReader {
  isEnabled(name: string, context?: FlagContext): boolean
}
