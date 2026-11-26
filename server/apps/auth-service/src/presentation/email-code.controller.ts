import { status } from '@grpc/grpc-js'
import { Controller, Inject } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import type {
  RequestEmailCodeRequest,
  RequestEmailCodeResponse,
} from '@platform/contracts/auth/v1/auth'
import { RequestEmailCode } from '../application'

/** Успех означает, что задание подтверждено PostgreSQL. */
@Controller()
export class EmailCodeController {
  constructor(@Inject(RequestEmailCode) private readonly codes: RequestEmailCode) {}

  @GrpcMethod('AuthService', 'RequestEmailCode')
  async requestEmailCode(request: RequestEmailCodeRequest): Promise<RequestEmailCodeResponse> {
    const result = await this.codes.execute(request.email).catch(() => {
      throw new RpcException({ code: status.UNAVAILABLE, message: 'Сервис временно недоступен' })
    })
    if (result === 'invalid_input')
      throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'Некорректный email' })
    if (result === 'limited')
      throw new RpcException({ code: status.RESOURCE_EXHAUSTED, message: 'Повторите запрос позже' })
    return {}
  }
}
