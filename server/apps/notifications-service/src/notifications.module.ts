import { Module, type DynamicModule } from '@nestjs/common'
import { FeatureFlagsClient, FeatureFlagsModule } from '@platform/feature-flags'
import { SendNotification, type FingerprintKeys } from './application'
import type { FeatureFlagsPort } from './application/ports/feature-flags.port.ts'
import { DispatchStore, NotificationsDatabase } from './infrastructure/prisma'
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
                inject: [DispatchStore, FeatureFlagsClient],
                useFactory: (store: DispatchStore, flags: FeatureFlagsPort) =>
                  new SendNotification(
                    store,
                    rpc.transports,
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
