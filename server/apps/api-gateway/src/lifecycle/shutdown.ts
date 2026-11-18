import { HealthState } from '@platform/health'
import { RequestScope } from '../grpc'

/** Согласует снятие готовности и ограниченное по времени завершение запросов. */
export class ShutdownCoordinator {
  readonly active = new Set<RequestScope>()
  private pending?: Promise<void>
  private drained?: () => void

  /** Получает зависимости и настройки компонента. */
  constructor(
    private readonly health: HealthState,
    private readonly timeoutMs: number,
    private readonly close: () => Promise<void>,
  ) {}

  /** Убирает завершённый запрос из числа активных. */
  complete(scope: RequestScope): void {
    this.active.delete(scope)
    if (!this.active.size) this.drained?.()
  }

  /** Запускает остановку один раз и возвращает общий Promise завершения. */
  stop(): Promise<void> {
    this.pending ??= this.run()
    return this.pending
  }

  /** Дожидается завершения активных запросов в пределах бюджета остановки. */
  private async run(): Promise<void> {
    this.health.beginShutdown()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const budget = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          for (const scope of this.active) scope.abort()
          reject(new Error('Истёк срок остановки'))
        }, this.timeoutMs)
      })
      const drain = async () => {
        if (this.active.size)
          await new Promise<void>((resolve) => {
            this.drained = resolve
            if (!this.active.size) resolve()
          })
        await this.close()
      }
      await Promise.race([drain(), budget])
    } finally {
      clearTimeout(timeout)
      this.drained = undefined
    }
  }
}
