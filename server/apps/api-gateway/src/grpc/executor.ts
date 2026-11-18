import { ClientUnaryCall, Metadata } from '@grpc/grpc-js'
import { randomUUID } from 'node:crypto'
import { GatewayError } from '../errors.ts'
import type { UnaryFactory } from './executor.types.ts'

/** Хранит бюджет, идентификатор и сигнал отмены HTTP-запроса. */
export class RequestScope {
  readonly requestId = randomUUID()
  readonly startedAt = performance.now()
  private readonly controller = new AbortController()
  readonly signal = this.controller.signal

  /** Получает зависимости и настройки компонента. */
  constructor(private readonly timeoutMs: number) {}

  /** Возвращает оставшийся бюджет вызова в миллисекундах. */
  remainingMs(): number {
    return Math.max(0, this.timeoutMs - (performance.now() - this.startedAt))
  }

  /** Отменяет связанные операции запроса. */
  abort(): void {
    this.controller.abort()
  }
}

/** Выполняет gRPC-вызовы в рамках общего бюджета без повторов. */
export class GrpcCallExecutor {
  /** Получает зависимости и настройки компонента. */
  constructor(private readonly timeoutMs: number) {}
  /** Выполняет один unary-вызов с оставшимся бюджетом и сигналом отмены. */
  execute<T>(callFactory: UnaryFactory<T>, scope: RequestScope): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const budget = Math.min(scope.remainingMs(), this.timeoutMs)
      if (scope.signal.aborted || budget <= 0) {
        reject(new GatewayError(503))
        return
      }
      let call: ClientUnaryCall | undefined
      let settled = false
      const cleanup = () => {
        clearTimeout(timer)
        scope.signal.removeEventListener('abort', abort)
      }
      const finish = (error: unknown, value?: T) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) {
          reject(error instanceof Error ? error : new GatewayError(500))
          scope.abort()
        } else if (value === undefined) reject(new GatewayError(503))
        else resolve(value)
      }
      const abort = () => {
        finish(new GatewayError(503))
        call?.cancel()
      }
      const timer = setTimeout(abort, budget)
      scope.signal.addEventListener('abort', abort, { once: true })
      const metadata = new Metadata()
      metadata.set('x-request-id', scope.requestId)
      try {
        call = callFactory(metadata, new Date(Date.now() + budget), finish)
      } catch (error) {
        finish(error)
      }
    })
  }
}
