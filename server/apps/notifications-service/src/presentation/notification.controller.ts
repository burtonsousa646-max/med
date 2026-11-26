import { createHash } from 'node:crypto'
import { status, type Metadata, type ServerUnaryCall } from '@grpc/grpc-js'
import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import type {
  SendNotificationRequest,
  SendNotificationResponse,
} from '@platform/contracts/notifications/v1/notifications'
import { SendNotification } from '../application'
import { NotificationsMetrics } from '../infrastructure/metrics/notifications-metrics.ts'

export const CLIENT_IDENTITIES = Symbol('CLIENT_IDENTITIES')

/** Идентичность берётся из сертификата mTLS, предоставленного проверенным соединением. */
@Controller()
export class NotificationController {
  constructor(
    @Inject(SendNotification) private readonly send: SendNotification,
    @Inject(CLIENT_IDENTITIES) private readonly clients: ReadonlyMap<string, string>,
    @Inject(NotificationsMetrics) private readonly metrics: NotificationsMetrics,
  ) {}

  /** Обрабатывает RPC в пределах дедлайна вызова и скрывает внутреннюю диагностику. */
  @GrpcMethod('NotificationsService', 'SendNotification')
  async sendNotification(
    request: SendNotificationRequest,
    _metadata: Metadata,
    call: ServerUnaryCall<SendNotificationRequest, SendNotificationResponse>,
  ) {
    const startedAt = performance.now()
    let succeeded = false
    try {
      const result = await this.dispatch(request, call)
      succeeded = true
      return result
    } finally {
      this.metrics.observe((performance.now() - startedAt) / 1000, succeeded)
    }
  }

  private async dispatch(
    request: SendNotificationRequest,
    call: ServerUnaryCall<SendNotificationRequest, SendNotificationResponse>,
  ) {
    const auth = call.getAuthContext()
    if (auth.transportSecurityType !== 'ssl' || !auth.sslPeerCertificate?.raw)
      throw new RpcException({ code: status.UNAUTHENTICATED, message: 'Требуется сертификат' })
    const identity = this.clients.get(
      createHash('sha256').update(auth.sslPeerCertificate.raw).digest('hex'),
    )
    if (!identity)
      throw new RpcException({ code: status.PERMISSION_DENIED, message: 'Нет доступа к отправке' })
    const stop = new AbortController()
    const cancel = () => {
      stop.abort()
    }
    call.once('cancelled', cancel)
    if (call.cancelled) cancel()
    try {
      return await this.send.execute(identity, request, {
        signal: stop.signal,
        deadline: Number(call.getDeadline()),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : ''
      if (reason === 'invalid_dispatch')
        throw new RpcException({ code: status.INVALID_ARGUMENT, message: reason })
      if (reason === 'dispatch_conflict' || reason === 'retry_conflict')
        throw new RpcException({ code: status.ABORTED, message: reason })
      throw new RpcException({
        code: status.UNAVAILABLE,
        message: 'Хранилище поручений недоступно',
      })
    } finally {
      call.removeListener('cancelled', cancel)
    }
  }
}
