import { readFileSync } from 'node:fs'
import { credentials, type ChannelCredentials } from '@grpc/grpc-js'
import { ClientGrpcProxy } from '@nestjs/microservices'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import {
  NotificationChannel,
  type NotificationsServiceClient,
  type SendNotificationRequest,
} from '@platform/contracts/notifications/v1/notifications'
import { firstValueFrom, timeout } from 'rxjs'
import type { AuthConfig } from '@platform/config'

/** Соединение с Notifications удостоверяет обе стороны сертификатами. */
export class GrpcNotifications {
  private readonly proxy: ClientGrpcProxy
  private readonly client: NotificationsServiceClient

  constructor(
    private readonly config: AuthConfig,
    transport?: ChannelCredentials,
  ) {
    const tls = config.notificationsTls
    this.proxy = new ClientGrpcProxy({
      url: config.notificationsTarget,
      package: 'platform.notifications.v1',
      protoPath: protoPath('notifications/v1/notifications.proto'),
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
      credentials:
        transport ??
        credentials.createSsl(readFileSync(tls.ca), readFileSync(tls.key), readFileSync(tls.cert)),
    })
    this.client = this.proxy.getService<NotificationsServiceClient>('NotificationsService')
  }

  async send(
    id: string,
    email: string,
    code: string,
    expiresAt: Date,
    retryAttemptId: string | null,
  ) {
    const millis = expiresAt.getTime()
    const request: SendNotificationRequest = {
      dispatchId: id,
      text: `Код подтверждения: ${code}`,
      email,
      phone: undefined,
      channels: [NotificationChannel.NOTIFICATION_CHANNEL_EMAIL],
      expiresAt: { seconds: String(Math.floor(millis / 1000)), nanos: (millis % 1000) * 1_000_000 },
      retryAttemptIds: retryAttemptId ? [retryAttemptId] : [],
    }
    return firstValueFrom(
      this.client.sendNotification(request).pipe(timeout(this.config.notificationsTimeoutMs)),
    )
  }

  onModuleDestroy() {
    this.proxy.close()
  }
}
