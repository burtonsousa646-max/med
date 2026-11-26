import { createHash } from 'node:crypto'
import { Module, type DynamicModule } from '@nestjs/common'
import { NotificationChannel } from '@platform/contracts/notifications/v1/notifications'
import { FeatureFlagsClient, FeatureFlagsModule } from '@platform/feature-flags'
import { SendNotification, type FingerprintKeys } from './application'
import type { FeatureFlagsPort } from './application/ports/feature-flags.port.ts'
import { DispatchStore, NotificationsDatabase } from './infrastructure/prisma'
import { PrismaTelegramLookupWindow } from './infrastructure/prisma/telegram-lookup-window.ts'
import { GramJsTelegramClient } from './infrastructure/telegram/gramjs-telegram.client.ts'
import { TelegramTransport } from './infrastructure/telegram/telegram.transport.ts'
import { CLIENT_IDENTITIES, NotificationController } from './presentation'
import type { RpcOptions } from './rpc.types.ts'

/** Предоставляет хранилище сценариям обработки внутренних поручений. */
@Module({})
export class NotificationsModule {
  static forRoot(databaseUrl: string, keys: FingerprintKeys, rpc?: RpcOptions): DynamicModule {
    return {
      module: NotificationsModule,
      imports: rpc
        ? [
            rpc.enableFeatureFlags
              ? FeatureFlagsModule.forRoot({ appName: 'notifications-service' })
              : FeatureFlagsModule.forTesting(),
          ]
        : [],
      controllers: rpc ? [NotificationController] : [],
      providers: [
        ...(rpc
          ? [
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
