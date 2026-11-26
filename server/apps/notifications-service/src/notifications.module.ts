import { createHash } from 'node:crypto'
import { Module, type DynamicModule } from '@nestjs/common'
import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { FeatureFlagsClient, FeatureFlagsModule } from '@platform/feature-flags'
import { HealthModule } from '@platform/health'
import { SendNotification, type FingerprintKeys } from './application'
import type { FeatureFlagsPort } from './application/ports/feature-flags.port.ts'
import { NotificationsMetrics } from './infrastructure/metrics/notifications-metrics.ts'
import { PostboxEventReader } from './infrastructure/postbox/postbox-event-reader.ts'
import { YdsEventStream } from './infrastructure/postbox/yds-event-stream.ts'
import { DispatchStore, NotificationsDatabase } from './infrastructure/prisma'
import { PrismaPostboxEventStore } from './infrastructure/prisma/postbox-event-store.ts'
import { PrismaTelegramLookupWindow } from './infrastructure/prisma/telegram-lookup-window.ts'
import { GramJsTelegramClient } from './infrastructure/telegram/gramjs-telegram.client.ts'
import { TelegramTransport } from './infrastructure/telegram/telegram.transport.ts'
import { CLIENT_IDENTITIES, NotificationController } from './presentation'
import { MetricsController } from './presentation/metrics.controller.ts'
import type { RpcOptions } from './rpc.types.ts'

/** Предоставляет хранилище сценариям обработки внутренних поручений. */
@Module({})
export class NotificationsModule {
  static forRoot(databaseUrl: string, keys: FingerprintKeys, rpc?: RpcOptions): DynamicModule {
    const stream = rpc?.postboxStream
    return {
      module: NotificationsModule,
      imports: rpc
        ? [
            HealthModule.register({ serviceName: 'notifications-service' }),
            rpc.enableFeatureFlags
              ? FeatureFlagsModule.forRoot({ appName: 'notifications-service' })
              : FeatureFlagsModule.forTesting(),
          ]
        : [],
      controllers: rpc ? [NotificationController, MetricsController] : [],
      providers: [
        ...(stream
          ? [
              {
                provide: PostboxEventReader,
                inject: [NotificationsDatabase],
                useFactory: (db: NotificationsDatabase) =>
                  new PostboxEventReader(
                    stream.name,
                    stream.identityId,
                    new YdsEventStream(stream),
                    new PrismaPostboxEventStore(db),
                  ),
              },
            ]
          : []),
        ...(rpc
          ? [
              NotificationsMetrics,
              { provide: CLIENT_IDENTITIES, useValue: rpc.clients },
              {
                provide: SendNotification,
                inject: [DispatchStore, FeatureFlagsClient, NotificationsDatabase],
                useFactory: (
                  store: DispatchStore,
                  flags: FeatureFlagsPort,
                  db: NotificationsDatabase,
                ) =>
                  new SendNotification(
                    store,
                    channelTransports(rpc, db),
                    rpc.timeoutMs,
                    rpc.resultReserveMs,
                    flags,
                    rpc.externalEmail,
                  ),
              },
            ]
          : []),
        {
          provide: NotificationsDatabase,
          useFactory: () => new NotificationsDatabase(databaseUrl),
        },
        {
          provide: DispatchStore,
          inject: [NotificationsDatabase],
          useFactory: (db: NotificationsDatabase) => new DispatchStore(db, keys),
        },
      ],
      exports: [DispatchStore],
    }
  }
}

/** Стабильный ключ окна не меняется при смене сессии одной и той же учётной записи. */
function channelTransports(rpc: RpcOptions, db: NotificationsDatabase) {
  if (!rpc.telegram || rpc.transports.has(NotificationChannel.NOTIFICATION_CHANNEL_TELEGRAM))
    return rpc.transports
  const accountKey = createHash('sha256').update(rpc.telegram.accountId).digest('hex')
  return new Map(rpc.transports).set(
    NotificationChannel.NOTIFICATION_CHANNEL_TELEGRAM,
    new TelegramTransport(
      accountKey,
      new PrismaTelegramLookupWindow(db),
      new GramJsTelegramClient(rpc.telegram),
    ),
  )
}
