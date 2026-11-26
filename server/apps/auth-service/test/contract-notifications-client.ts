import { credentials } from '@grpc/grpc-js'
import type { AuthConfig } from '@platform/config'
import { GrpcNotifications } from '../src/infrastructure/grpc/notifications.ts'

/** Только тестовый Pact-транспорт работает без TLS. */
export function contractNotificationsClient(port: number) {
  const config = {
    notificationsTarget: `127.0.0.1:${port}`,
    notificationsTimeoutMs: 3000,
    notificationsTls: { ca: '', cert: '', key: '' },
  } as AuthConfig
  return new GrpcNotifications(config, credentials.createInsecure())
}
