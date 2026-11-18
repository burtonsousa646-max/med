import { Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { GatewayError } from './errors.ts'
import { RequestScope } from './grpc'

/** Связывает HTTP-запрос с контекстом его выполнения. */
@Injectable()
export class RequestContexts {
  private readonly scopes = new WeakMap<Request, RequestScope>()

  /** Сохраняет контекст для времени жизни запроса. */
  set(request: Request, scope: RequestScope): void {
    this.scopes.set(request, scope)
  }

  /** Возвращает контекст зарегистрированного HTTP-запроса. */
  get(request: Request): RequestScope {
    const scope = this.scopes.get(request)
    if (!scope) throw new GatewayError(503)
    return scope
  }

  /** Удаляет связь после завершения запроса. */
  delete(request: Request): void {
    this.scopes.delete(request)
  }
}
