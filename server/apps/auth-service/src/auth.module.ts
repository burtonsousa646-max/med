import { GrpcPartnerProfiles } from './infrastructure/grpc'
import { GrpcNotifications } from './infrastructure/grpc/notifications.ts'
import { EmailDeliveryWorker } from './infrastructure/prisma/email-delivery.ts'
import { Module, type DynamicModule } from '@nestjs/common'
import { type AuthConfig } from '@platform/config'
import { HealthModule } from '@platform/health'
import { RegisterProfile, RequestEmailCode, VerifyEmailCode, Sessions } from './application'
import { EncryptedCodes } from './infrastructure'
import {
  PrismaChallengeStore,
  PrismaRegistrationStore,
  PrismaSessionStore,
  AUTH_DATABASE,
  createDatabase,
  type AuthDatabase,
} from './infrastructure/prisma'
import { EmailCodeController, SessionController } from './presentation'

export const SERVICE_NAME = 'auth-service'

/** Подключает порт хранилища и криптографическую защиту проверок. */
@Module({})
export class AuthModule {
  static forRoot(config: AuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [HealthModule.register({ serviceName: SERVICE_NAME })],
      controllers: [EmailCodeController, SessionController],
      providers: [
        { provide: GrpcNotifications, useFactory: () => new GrpcNotifications(config) },
        {
          provide: EmailDeliveryWorker,
          inject: [AUTH_DATABASE, EncryptedCodes, GrpcNotifications],
          useFactory: (db: AuthDatabase, codes: EncryptedCodes, notifications: GrpcNotifications) =>
            new EmailDeliveryWorker(db, codes, notifications),
        },
        {
          provide: Sessions,
          inject: [AUTH_DATABASE],
          useFactory: (db: AuthDatabase) => new Sessions(new PrismaSessionStore(db)),
        },
        { provide: AUTH_DATABASE, useFactory: () => createDatabase(config) },
        {
          provide: PrismaChallengeStore,
          inject: [AUTH_DATABASE],
          useFactory: (db: AuthDatabase) => new PrismaChallengeStore(db),
        },
        {
          provide: PrismaRegistrationStore,
          inject: [AUTH_DATABASE],
          useFactory: (db: AuthDatabase) => new PrismaRegistrationStore(db),
        },
        {
          provide: EncryptedCodes,
          useFactory: () => new EncryptedCodes(Buffer.from(config.codeKey, 'hex')),
        },
        {
          provide: GrpcPartnerProfiles,
          useFactory: () =>
            new GrpcPartnerProfiles(config.partnersTarget, config.partnersTimeoutMs),
        },
        {
          provide: RequestEmailCode,
          inject: [PrismaChallengeStore, EncryptedCodes],
          useFactory: (store: PrismaChallengeStore, protection: EncryptedCodes) =>
            new RequestEmailCode(store, protection),
        },
        {
          provide: VerifyEmailCode,
          inject: [PrismaChallengeStore, EncryptedCodes],
          useFactory: (store: PrismaChallengeStore, protection: EncryptedCodes) =>
            new VerifyEmailCode(store, protection),
        },
        {
          provide: RegisterProfile,
          inject: [VerifyEmailCode, GrpcPartnerProfiles, PrismaRegistrationStore],
          useFactory: (
            verify: VerifyEmailCode,
            profiles: GrpcPartnerProfiles,
            store: PrismaRegistrationStore,
          ) => new RegisterProfile(verify, profiles, store),
        },
      ],
    }
  }
}
