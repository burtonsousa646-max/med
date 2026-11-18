import type { DiagnosticCounter } from './diagnostics.types.ts'
import type { PlatformLogger } from '@platform/logger'

import type { Diagnostics } from '../application/ports'
import type { SuggestionKind } from '../domain/suggestion'

const DIAGNOSTIC_INTERVAL_MS = 10_000

/** Повторяющиеся отказы дают одну запись за интервал со счётчиком подавленных событий. */
export class DiagnosticReporter implements Diagnostics {
  private readonly events = new Map<string, DiagnosticCounter>()

  /** Получает безопасный логгер и часы для управления интервалом подавления событий. */
  constructor(
    private readonly logger: PlatformLogger,
    private readonly now = () => Date.now(),
  ) {}

  /**
   * Пишет только категории, вид, источник и число подавленных повторов.
   * Для каждой комбинации первая запись немедленная; следующая возможна через десять секунд.
   * Накопленный счётчик попадёт в следующую запись, отдельного фонового сброса нет.
   */
  record(result: string, kind: SuggestionKind, provider: string): void {
    const key = `${result}:${kind}:${provider}`
    const previous = this.events.get(key)
    const timestamp = this.now()

    if (previous && timestamp - previous.at < DIAGNOSTIC_INTERVAL_MS) {
      previous.suppressed++
      return
    }

    this.logger.event(
      'diagnostic',
      { result, kind, provider, suppressed: previous?.suppressed ?? 0 },
      'warn',
    )
    this.events.set(key, { at: timestamp, suppressed: 0 })
  }
}
