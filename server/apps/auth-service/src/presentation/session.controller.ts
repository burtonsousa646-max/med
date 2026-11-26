import { status } from '@grpc/grpc-js'
import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import type {
  AuthServiceController,
  VerifyEmailCodeRequest,
  ValidateSessionRequest,
  RefreshSessionRequest,
  RevokeSessionRequest,
} from '@platform/contracts/auth/v1/auth'
import { RegisterProfile, Sessions } from '../application'
import { SessionDenied } from '../domain'

/** В gRPC details передаётся только известный код. Текст ошибки базы может содержать секреты. */
function rpcFailure(error: unknown): never {
  if (error instanceof SessionDenied)
    throw new RpcException({ code: status.UNAUTHENTICATED, message: error.reason })
  throw new RpcException({ code: status.UNAVAILABLE, message: 'Сервис временно недоступен' })
}

/** Timestamp передаётся в формате, поддерживаемом загрузчиком protobuf платформы. */
function timestamp(date: Date) {
  const milliseconds = date.getTime()
  return {
    seconds: String(Math.floor(milliseconds / 1000)),
    nanos: (milliseconds % 1000) * 1_000_000,
  }
}

/** Принимает внутренние запросы Gateway по контракту AuthService. */
@Controller()
export class SessionController implements Pick<
  AuthServiceController,
  'verifyEmailCode' | 'validateSession' | 'refreshSession' | 'revokeSession'
> {
  constructor(
    @Inject(RegisterProfile) private readonly registration: RegisterProfile,
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}

  @GrpcMethod('AuthService', 'VerifyEmailCode')
  async verifyEmailCode(request: VerifyEmailCodeRequest) {
    const registration = await this.registration
      .execute(request.email, request.code)
      .catch(rpcFailure)
    if (registration.outcome !== 'ok') {
      const codes = {
        invalid_input: status.INVALID_ARGUMENT,
        invalid_code: status.UNAUTHENTICATED,
        limited: status.RESOURCE_EXHAUSTED,
      }
      throw new RpcException({ code: codes[registration.outcome], message: registration.outcome })
    }
    const { accessToken, refreshToken, expiresAt } = await this.sessions
      .open({ userId: registration.userId, verifiedEmail: registration.verifiedEmail })
      .catch(rpcFailure)
    return { tokens: { accessToken, refreshToken, accessExpiresAt: timestamp(expiresAt) } }
  }

  @GrpcMethod('AuthService', 'ValidateSession')
  validateSession(request: ValidateSessionRequest) {
    return this.sessions.validate(request.accessToken, request.userActivity).catch(rpcFailure)
  }

  @GrpcMethod('AuthService', 'RefreshSession')
  async refreshSession(request: RefreshSessionRequest) {
    const { accessToken, expiresAt } = await this.sessions
      .refresh(request.refreshToken)
      .catch(rpcFailure)
    return { accessToken, accessExpiresAt: timestamp(expiresAt) }
  }

  @GrpcMethod('AuthService', 'RevokeSession')
  async revokeSession(request: RevokeSessionRequest) {
    await this.sessions.revoke(request.refreshToken).catch(rpcFailure)
    return {}
  }
}
