import { Module, type DynamicModule } from '@nestjs/common'
import { SendNotification, type FingerprintKeys } from './application'
import { DispatchStore, NotificationsDatabase } from './infrastructure/prisma'
import { CLIENT_IDENTITIES, NotificationController } from './presentation'
import type { RpcOptions } from './rpc.types.ts'

/** Предоставляет хранилище сценариям обработки внутренних поручений. */
@Module({})
export class NotificationsModule {
  static forRoot(databaseUrl: string, keys: FingerprintKeys, rpc?: RpcOptions): DynamicModule {
    return {
      module: NotificationsModule,
      controllers: rpc ? [NotificationController] : [],
      providers: [
        ...(rpc
          ? [
              { provide: CLIENT_IDENTITIES, useValue: rpc.clients },
              {
                provide: SendNotification,
                inject: [DispatchStore],
                useFactory: (store: DispatchStore) =>
                  new SendNotification(store, rpc.transports, rpc.timeoutMs, rpc.resultReserveMs),
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
