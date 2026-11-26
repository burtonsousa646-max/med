/** Читает флаги сервиса из локального кеша. */
export interface FeatureFlagsPort {
  isEnabled(name: string): boolean
}
