import type { RpcContext } from './suggestion.controller.types.ts'

// gRPC-граница: связывает отмену и дедлайн с поиском и возвращает безопасные ошибки.
import { Controller } from '@nestjs/common'
import { GrpcMethod, RpcException } from '@nestjs/microservices'
import { Metadata, status, type ServerUnaryCall } from '@grpc/grpc-js'

import type {
  SuggestionServiceController,
  SuggestPartiesRequest,
  SuggestPartiesResponse,
  SuggestAddressesRequest,
  SuggestAddressesResponse,
  SuggestBanksRequest,
  SuggestBanksResponse,
  SuggestEmailsRequest,
  SuggestEmailsResponse,
} from '@platform/contracts/suggestion/v1/suggestion'

import { SuggestUseCase } from '../../application/suggest'
import {
  InvalidQueryError,
  SourceUnavailableError,
  OperationCancelledError,
  type SuggestionKind,
} from '../../domain/suggestion'

/**
 * gRPC-вход четырёх справочников: переводит DTO и управляет временем жизни поиска.
 * Нормализация и кеширование остаются в сценарии, безопасные статусы ошибок — на этой границе.
 */
@Controller()
export class SuggestionController implements SuggestionServiceController {
  /** Получает общий сценарий; транспортные DTO не передаются в его зависимости. */
  constructor(private readonly useCase: SuggestUseCase) {}

  /**
   * Поиск организаций и ИП; возвращает модели в envelope согласованного RPC.
   */
  @GrpcMethod('SuggestionService', 'SuggestParties')
  async suggestParties(
    request: SuggestPartiesRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<SuggestPartiesRequest, SuggestPartiesResponse>,
  ): Promise<SuggestPartiesResponse> {
    return { items: await this.invoke('party', request.query, call) }
  }

  /**
   * Поиск адресов; явно передаёт необязательные coordinates для сгенерированного типа ответа.
   */
  @GrpcMethod('SuggestionService', 'SuggestAddresses')
  async suggestAddresses(
    request: SuggestAddressesRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<SuggestAddressesRequest, SuggestAddressesResponse>,
  ): Promise<SuggestAddressesResponse> {
    const items = await this.invoke('address', request.query, call)

    return { items: items.map((item) => ({ ...item, coordinates: item.coordinates })) }
  }

  /**
   * Поиск банков; транспортная оболочка не меняет порядок и состав вариантов сценария.
   */
  @GrpcMethod('SuggestionService', 'SuggestBanks')
  async suggestBanks(
    request: SuggestBanksRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<SuggestBanksRequest, SuggestBanksResponse>,
  ): Promise<SuggestBanksResponse> {
    return { items: await this.invoke('bank', request.query, call) }
  }

  /**
   * Поиск адресов электронной почты через общий сценарий с видом email.
   */
  @GrpcMethod('SuggestionService', 'SuggestEmails')
  async suggestEmails(
    request: SuggestEmailsRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<SuggestEmailsRequest, SuggestEmailsResponse>,
  ): Promise<SuggestEmailsResponse> {
    return { items: await this.invoke('email', request.query, call) }
  }

  /**
   * Связывает отмену unary-вызова и абсолютный дедлайн с AbortSignal сценария.
   * При отсутствии контекста дедлайн не ограничен; после завершения удаляет таймер и подписку.
   * Исключения сценария преобразует в безопасные RPC-ошибки без исходных данных.
   */
  private async invoke<K extends SuggestionKind>(kind: K, query: string, call?: RpcContext) {
    const controller = new AbortController()
    const abort = () => {
      controller.abort()
    }
    const deadline = call?.getDeadline() ?? Infinity
    const deadlineAtMs = deadline instanceof Date ? deadline.getTime() : deadline

    if (call?.cancelled || deadlineAtMs <= Date.now()) abort()
    call?.once('cancelled', abort)

    let timer: ReturnType<typeof setTimeout> | undefined
    if (Number.isFinite(deadlineAtMs)) {
      const remainingMs = Math.min(2_147_483_647, Math.max(0, deadlineAtMs - Date.now()))
      timer = setTimeout(abort, remainingMs)
    }

    try {
      return await this.useCase.execute(kind, query, { signal: controller.signal, deadlineAtMs })
    } catch (error) {
      throw mapRpcError(error)
    } finally {
      // Unary-вызов завершён: его таймер и подписка больше не должны удерживать контекст.
      clearTimeout(timer)
      call?.removeListener('cancelled', abort)
    }
  }
}

/**
 * Отображает ошибки в INVALID_ARGUMENT, UNAVAILABLE, CANCELLED или INTERNAL.
 * Непредвиденные исключения скрываются за общим сообщением; детали источника наружу не уходят.
 */
function mapRpcError(error: unknown): RpcException {
  if (error instanceof InvalidQueryError) {
    return new RpcException({ code: status.INVALID_ARGUMENT, message: 'Некорректный запрос' })
  }

  if (error instanceof SourceUnavailableError) {
    return new RpcException({ code: status.UNAVAILABLE, message: 'Сервис временно недоступен' })
  }

  const code = error instanceof OperationCancelledError ? status.CANCELLED : status.INTERNAL
  return new RpcException({ code, message: 'Операция не выполнена' })
}
