/** Разрешённые поля записи о завершённом запросе. */
export interface RequestLogRecord {
  requestId: string
  appId?: string
  operationId?: string
  route?: string
  method: string
  status: number
  durationMs: number
  code?: string
}

/** Обязательные метаданные и уровень логгера процесса. */
export interface LoggerOptions {
  service: string
  version: string
  env: string
  level: string
}
