import type { Type } from '@nestjs/common'

/** Операция из OpenAPI с параметрами доступа и ограничений. */
export interface Operation {
  operationId: string
  security?: unknown
  'x-suggestion-rate-limit'?: boolean
  [key: string]: unknown
}

/** Описание приложения и его операций из контракта OpenAPI. */
export interface ApiDocument {
  openapi: string
  info: { title: string; version: string }
  servers: { url: string }[]
  paths: Record<string, Record<string, Operation>>
  components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> }
}

/** Связывает операцию контракта с обработчиком Gateway. */
export interface OperationBinding {
  rateLimit?: boolean
  operationId: string
  method: string
  path: string
  controller: Type
  handler: string
}

/** Определяет приложение, его префикс, контракт и обработчики. */
export interface AppDefinition {
  id: string
  documentFile: string
  prefix?: string
  operations: readonly OperationBinding[]
}

/** Содержит найденную операцию и её параметры маршрута. */
export interface ResolvedOperation {
  appId: string
  operation: Operation
  binding: OperationBinding
  route: string
}
