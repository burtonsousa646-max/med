import type { CallOptions, Client, ClientUnaryCall, Metadata, ServiceError } from '@grpc/grpc-js'
import type {
  SuggestAddressesResponse,
  SuggestBanksResponse,
  SuggestEmailsResponse,
  SuggestPartiesResponse,
} from '@platform/contracts/suggestion/v1/suggestion'

/** Описывает ответ gRPC-вызова. */
export type Callback<T> = (error: ServiceError | null, response?: T) => void

/** Описывает низкоуровневый unary-вызов с параметрами и отменой. */
export type Unary<T> = (
  request: { query: string },
  metadata: Metadata,
  options: CallOptions,
  callback: Callback<T>,
) => ClientUnaryCall

/** Содержит методы низкоуровневого клиента Suggestion. */
export interface NativeClient extends Client {
  suggestParties: Unary<SuggestPartiesResponse>
  suggestAddresses: Unary<SuggestAddressesResponse>
  suggestBanks: Unary<SuggestBanksResponse>
  suggestEmails: Unary<SuggestEmailsResponse>
}
