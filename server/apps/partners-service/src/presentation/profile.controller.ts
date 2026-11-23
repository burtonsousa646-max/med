import { status } from '@grpc/grpc-js'
import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import type {
  EnsureUserProfileRequest,
  GetUserProfileRequest,
  PartnersServiceController,
} from '@platform/contracts/partners/v1/partners'
import { EnsureUserProfile, GetUserProfile } from '../application'
import { ProfileError } from '../domain'

/** Преобразует ошибки без передачи адресов и диагностики PostgreSQL вызывающему. */
function rpcFailure(error: unknown): never {
  if (error instanceof ProfileError) {
    const errors = {
      invalid_input: { code: status.INVALID_ARGUMENT, message: 'Некорректные параметры профиля' },
      registration_conflict: {
        code: status.ABORTED,
        message: 'Ключ регистрации уже использован с другими данными',
      },
      not_found: { code: status.NOT_FOUND, message: 'Профиль не найден' },
    }
    throw new RpcException(errors[error.reason])
  }
  throw new RpcException({
    code: status.UNAVAILABLE,
    message: 'Сервис профилей временно недоступен',
  })
}

/** Внутренние операции регистрации для Auth и чтения для Gateway. */
@Controller()
export class ProfileController implements Pick<
  PartnersServiceController,
  'ensureUserProfile' | 'getUserProfile'
> {
  constructor(
    @Inject(EnsureUserProfile) private readonly ensure: EnsureUserProfile,
    @Inject(GetUserProfile) private readonly get: GetUserProfile,
  ) {}

  /** Обрабатывает команду регистрации от Auth. */
  @GrpcMethod('PartnersService', 'EnsureUserProfile')
  async ensureUserProfile(request: EnsureUserProfileRequest) {
    const userId = await this.ensure
      .execute(request.registrationId, request.verifiedEmail)
      .catch(rpcFailure)
    return { userId }
  }

  /** Возвращает контакты пользователя до оформления первой организации. */
  @GrpcMethod('PartnersService', 'GetUserProfile')
  async getUserProfile(request: GetUserProfileRequest) {
    const profile = await this.get.execute(request.userId).catch(rpcFailure)
    return { profile: { ...profile, organization: undefined, canInvite: false } }
  }
}
