import { status } from '@grpc/grpc-js'
import { RpcException } from '@nestjs/microservices'
import { ProfileError } from '../domain'

/** Преобразует ошибки без передачи адресов и диагностики PostgreSQL вызывающему. */
export function rpcFailure(error: unknown): never {
  if (error instanceof ProfileError) {
    const errors = {
      invalid_input: { code: status.INVALID_ARGUMENT, message: 'Некорректные параметры профиля' },
      registration_conflict: {
        code: status.ABORTED,
        message: 'Ключ регистрации уже использован с другими данными',
      },
      invitation_required: { code: status.ALREADY_EXISTS, message: 'invitation_required' },
      forbidden: { code: status.PERMISSION_DENIED, message: 'Недостаточно полномочий' },
      invitation_conflict: { code: status.ABORTED, message: 'Конфликт приглашения' },
      not_found: { code: status.NOT_FOUND, message: 'Ресурс не найден' },
    }
    throw new RpcException(errors[error.reason])
  }
  throw new RpcException({
    code: status.UNAVAILABLE,
    message: 'Сервис профилей временно недоступен',
  })
}
