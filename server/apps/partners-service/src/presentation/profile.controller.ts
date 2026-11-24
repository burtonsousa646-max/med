import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import type {
  EnsureUserProfileRequest,
  GetUserProfileRequest,
  ResolveCampaignOrganizationRequest,
  GetRepresentativeRequest,
  PartnersServiceController,
} from '@platform/contracts/partners/v1/partners'
import { EnsureUserProfile, GetUserProfile, ResolveCampaignOrganization } from '../application'
import { rpcFailure } from './rpc-failure.ts'

/** Внутренние операции регистрации для Auth и чтения для Gateway. */
@Controller()
export class ProfileController implements Pick<
  PartnersServiceController,
  'ensureUserProfile' | 'getUserProfile' | 'resolveCampaignOrganization' | 'getRepresentative'
> {
  constructor(
    @Inject(EnsureUserProfile) private readonly ensure: EnsureUserProfile,
    @Inject(GetUserProfile) private readonly get: GetUserProfile,
    @Inject(ResolveCampaignOrganization) private readonly resolve: ResolveCampaignOrganization,
  ) {}

  /** Обрабатывает команду регистрации от Auth. */
  @GrpcMethod('PartnersService', 'EnsureUserProfile')
  async ensureUserProfile(request: EnsureUserProfileRequest) {
    const userId = await this.ensure
      .execute(request.registrationId, request.verifiedEmail)
      .catch(rpcFailure)
    return { userId }
  }

  /** Возвращает контакты пользователя и его актуальную организацию. */
  @GrpcMethod('PartnersService', 'GetUserProfile')
  async getUserProfile(request: GetUserProfileRequest) {
    const profile = await this.get.execute(request.userId).catch(rpcFailure)
    return { profile }
  }

  @GrpcMethod('PartnersService', 'ResolveCampaignOrganization')
  async resolveCampaignOrganization(request: ResolveCampaignOrganizationRequest) {
    const organization = await this.resolve
      .execute(request.userId, request.inn, request.customerName)
      .catch(rpcFailure)
    return { organization }
  }

  @GrpcMethod('PartnersService', 'GetRepresentative')
  async getRepresentative(request: GetRepresentativeRequest) {
    const profile = await this.get
      .representative(request.userId, request.organizationId)
      .catch(rpcFailure)
    return { profile }
  }
}
