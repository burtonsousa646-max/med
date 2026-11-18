import type { CallOptions, Client, ClientUnaryCall, Metadata, ServiceError } from '@grpc/grpc-js'

export interface Echo {
  value: string
}
export interface EchoClient extends Client {
  echo(
    request: Echo,
    metadata: Metadata,
    options: CallOptions,
    callback: (error: ServiceError | null, value?: Echo) => void,
  ): ClientUnaryCall
}
