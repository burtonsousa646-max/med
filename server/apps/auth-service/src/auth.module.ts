import { Module, type DynamicModule } from '@nestjs/common'
import { type AuthConfig } from '@platform/config'
import { HealthModule } from '@platform/health'
import { RequestEmailCode } from './application'
import { EncryptedCodes } from './infrastructure'
import {
  PrismaChallengeStore,
  AUTH_DATABASE,
  createDatabase,
  type AuthDatabase,
} from './infrastructure/prisma'
import { EmailCodeController } from './presentation'

export const SERVICE_NAME = 'auth-service'

/** Подключает порт хранилища и криптографическую защиту проверок. */
@Module({})
export class AuthModule {
  static forRoot(config: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [HealthModule.register({ serviceName: SERVICE_NAME })],
      controllers: [EmailCodeController],
      providers: [
        { provide: AUTH_DATABASE, useFactory: () => createDatabase(config) },
        {
          provide: RequestEmailCode,
          inject: [AUTH_DATABASE],
          useFactory: (db: AuthDatabase) =>
            new RequestEmailCode(
              new PrismaChallengeStore(db),
              new EncryptedCodes(Buffer.from(config.codeKey, 'hex')),
            ),
        },
      ],
    }
  }
}
