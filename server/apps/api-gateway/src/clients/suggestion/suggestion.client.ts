import {
  ClientOptions,
  credentials,
  makeGenericClientConstructor,
  ServiceDefinition,
} from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { PROTO_LOADER_OPTIONS, protoPath } from '@platform/contracts'
import type {
  SuggestAddressesResponse,
  SuggestBanksResponse,
  SuggestEmailsResponse,
  SuggestPartiesResponse,
} from '@platform/contracts/suggestion/v1/suggestion'
import { GrpcCallExecutor, RequestScope } from '../../grpc'
import type { NativeClient } from './suggestion.client.types.ts'

/** Вызывает сервис подсказок через gRPC с бюджетом и отменой запроса. */
export class SuggestionGrpcClient {
  private readonly client: NativeClient
  private readonly executor: GrpcCallExecutor

  /** Получает зависимости и настройки компонента. */
  constructor(target: string, timeoutMs: number) {
    const definition = loadSync(protoPath('suggestion/v1/suggestion.proto'), {
      ...PROTO_LOADER_OPTIONS,
      includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs],
    })
    const service = definition['platform.suggestion.v1.SuggestionService'] as ServiceDefinition
    const Constructor = makeGenericClientConstructor(
      service,
      'SuggestionService',
    ) as unknown as new (
      address: string,
      channelCredentials: ReturnType<typeof credentials.createInsecure>,
      options: ClientOptions,
    ) => NativeClient
    this.client = new Constructor(target, credentials.createInsecure(), {
      'grpc.enable_retries': 0,
    })
    this.executor = new GrpcCallExecutor(timeoutMs)
  }

  /** Запрашивает варианты организаций и ИП. */
  suggestParties(query: string, scope: RequestScope) {
    return this.executor.execute<SuggestPartiesResponse>(
      (metadata, deadline, callback) =>
        this.client.suggestParties({ query }, metadata, { deadline }, callback),
      scope,
    )
  }

  /** Запрашивает варианты адресов. */
  suggestAddresses(query: string, scope: RequestScope) {
    return this.executor.execute<SuggestAddressesResponse>(
      (metadata, deadline, callback) =>
        this.client.suggestAddresses({ query }, metadata, { deadline }, callback),
      scope,
    )
  }

  /** Запрашивает варианты банков. */
  suggestBanks(query: string, scope: RequestScope) {
    return this.executor.execute<SuggestBanksResponse>(
      (metadata, deadline, callback) =>
        this.client.suggestBanks({ query }, metadata, { deadline }, callback),
      scope,
    )
  }

  /** Запрашивает варианты электронной почты. */
  suggestEmails(query: string, scope: RequestScope) {
    return this.executor.execute<SuggestEmailsResponse>(
      (metadata, deadline, callback) =>
        this.client.suggestEmails({ query }, metadata, { deadline }, callback),
      scope,
    )
  }

  /** Закрывает ресурс и освобождает связанные соединения. */
  close(): void {
    this.client.close()
  }
}
