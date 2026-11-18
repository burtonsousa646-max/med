import { PlatformLogger } from '@platform/logger'

/** Ограничивает повторяющиеся сообщения диагностики лимитера. */
export class RateDiagnostics {
  private readonly events = new Map<string, { at: number; suppressed: number }>()

  /** Получает зависимости и настройки компонента. */
  constructor(
    private readonly logger: () => PlatformLogger,
    private readonly now = () => Date.now(),
  ) {}

  /** Регистрирует безопасную категорию результата с подавлением повторов. */
  record(result: string): void {
    const old = this.events.get(result)
    const now = this.now()
    if (old && now - old.at < 10000) {
      old.suppressed++
      return
    }
    this.logger().event('diagnostic', { result, suppressed: old?.suppressed ?? 0 }, 'warn')
    this.events.set(result, { at: now, suppressed: 0 })
  }
}
