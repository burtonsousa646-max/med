import type { FeatureFlagsReader, FlagContext } from './types.js'

/** Флаги в памяти для модульных и интеграционных тестов сервисов: без Unleash и сети. */
export class InMemoryFeatureFlags implements FeatureFlagsReader {
  private readonly flags: Map<string, boolean>

  constructor(enabled: Record<string, boolean> = {}) {
    this.flags = new Map(Object.entries(enabled))
  }

  /** Значение из словаря, по умолчанию `false`. Контекст не учитывается. */
  isEnabled(name: string, _context?: FlagContext): boolean {
    return this.flags.get(name) ?? false
  }

  set(name: string, enabled: boolean): void {
    this.flags.set(name, enabled)
  }
}
