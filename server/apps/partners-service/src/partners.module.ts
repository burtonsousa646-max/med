import { Module, type DynamicModule } from '@nestjs/common'
import type { PartnersConfig } from '@platform/config'
import { HealthModule } from '@platform/health'
import { EnsureUserProfile, GetUserProfile } from './application'
import {
  createDatabase,
  PARTNERS_DATABASE,
  PrismaProfileRepository,
  type PartnersDatabase,
} from './infrastructure/prisma'
import { ProfileController } from './presentation'

export const SERVICE_NAME = 'partners-service'

/** Подключает сценарии профиля к собственной базе сервиса. */
@Module({})
export class PartnersModule {
  static forRoot(config: PartnersConfig): DynamicModule {
    return {
      module: PartnersModule,
      imports: [HealthModule.register({ serviceName: SERVICE_NAME })],
      controllers: [ProfileController],
      providers: [
        { provide: PARTNERS_DATABASE, useFactory: () => createDatabase(config) },
        {
          provide: PrismaProfileRepository,
          inject: [PARTNERS_DATABASE],
          useFactory: (db: PartnersDatabase) => new PrismaProfileRepository(db),
        },
        {
          provide: EnsureUserProfile,
          inject: [PrismaProfileRepository],
          useFactory: (repo: PrismaProfileRepository) => new EnsureUserProfile(repo),
        },
        {
          provide: GetUserProfile,
          inject: [PrismaProfileRepository],
          useFactory: (repo: PrismaProfileRepository) => new GetUserProfile(repo),
        },
      ],
    }
  }
}
