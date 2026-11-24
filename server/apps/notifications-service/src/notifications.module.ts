import { Module, type DynamicModule } from '@nestjs/common'
import type { FingerprintKeys } from './application'
import { DispatchStore, NotificationsDatabase } from './infrastructure/prisma'

/** Предоставляет хранилище сценариям обработки внутренних поручений. */
@Module({})
export class NotificationsModule {
  static forRoot(databaseUrl: string, keys: FingerprintKeys): DynamicModule {
    return {
      module: NotificationsModule,
      providers: [
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
