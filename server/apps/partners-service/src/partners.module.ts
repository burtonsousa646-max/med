import { Module, type DynamicModule } from '@nestjs/common'
import type { PartnersConfig } from '@platform/config'
import { HealthModule } from '@platform/health'
import {
  Invitations,
  EnsureUserProfile,
  GetUserProfile,
  ResolveCampaignOrganization,
} from './application'
import {
  createDatabase,
  PARTNERS_DATABASE,
  PrismaInvitations,
  PrismaProfileRepository,
  type PartnersDatabase,
} from './infrastructure/prisma'
import { InvitationController, ProfileController } from './presentation'

export const SERVICE_NAME = 'partners-service'

/** Подключает сценарии профиля к собственной базе сервиса. */
@Module({})
export class PartnersModule {
  static forRoot(config: PartnersConfig): DynamicModule {
    return {
      module: PartnersModule,
      imports: [HealthModule.register({ serviceName: SERVICE_NAME })],
      controllers: [ProfileController, InvitationController],
      providers: [
        {
          provide: Invitations,
          inject: [PARTNERS_DATABASE],
          useFactory: (db: PartnersDatabase) => new Invitations(new PrismaInvitations(db)),
        },
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
          provide: ResolveCampaignOrganization,
          inject: [PrismaProfileRepository],
          useFactory: (repo: PrismaProfileRepository) => new ResolveCampaignOrganization(repo),
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
