import type { ClientUnaryCall, Metadata, ServiceError } from '@grpc/grpc-js'

/** Создаёт отменяемый unary-вызов для исполнителя gRPC. */
export type UnaryFactory<T> = (
  metadata: Metadata,
  deadline: Date,
  callback: (error: ServiceError | null, value?: T) => void,
) => ClientUnaryCall
