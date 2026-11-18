import type { RequestLogRecord, LoggerOptions } from './logger.types.ts'
import { DynamicModule, LoggerService, Module } from '@nestjs/common'
import { LoggerModule, PinoLogger } from 'nestjs-pino'
import pino, { Logger, DestinationStream } from 'pino'

const keys = new Set([
  'requestId',
  'appId',
  'operationId',
  'route',
  'method',
  'status',
  'durationMs',
  'code',
  'kind',
  'provider',
  'result',
  'queryLength',
  'suppressed',
])
const messages = {
  request: 'Запрос завершён',
  startup: 'Процесс запущен',
  shutdown: 'Процесс останавливается',
  failure: 'Ошибка компонента',
  diagnostic: 'Состояние компонента',
} as const

/** Записывает только разрешённые диагностические поля и безопасные сообщения. */
export class PlatformLogger implements LoggerService {
  constructor(private readonly target: Logger) {}

  /** Фильтрует поля события по белому списку и записывает сообщение заданного уровня. */
  event(
    event: keyof typeof messages,
    record: RequestLogRecord | Readonly<Record<string, string | number | undefined>>,
    level: 'info' | 'warn' | 'error' = 'info',
  ): void {
    const safe: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(record)) {
      if (
        keys.has(key) &&
        (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
      )
        safe[key] = value
    }
    this.target[level](safe, messages[event])
  }

  // NestJS и сторонние библиотеки не получают права писать произвольные сообщения.
  /** Заменяет произвольное сообщение NestJS безопасным текстом. */
  log(_message: unknown): void {
    this.target.info('Событие NestJS')
  }

  /** Записывает безопасное предупреждение NestJS. */
  warn(_message: unknown): void {
    this.target.warn('Предупреждение NestJS')
  }

  /** Записывает безопасную ошибку NestJS. */
  error(_message: unknown): void {
    this.target.error('Ошибка NestJS')
  }

  /** Записывает безопасную диагностику NestJS. */
  debug(_message: unknown): void {
    this.target.debug('Диагностика NestJS')
  }

  /** Записывает подробную диагностику NestJS без исходного сообщения. */
  verbose(_message: unknown): void {
    this.target.debug('Диагностика NestJS')
  }
}

/** Формирует поле timestamp в UTC для Pino. */
function timestamp(): string {
  return `,"timestamp":${JSON.stringify(new Date().toISOString())}`
}

/** Создаёт логгер процесса; поток вывода можно подменить в тестах. */
export function createPlatformLogger(
  options: LoggerOptions,
  destination?: DestinationStream,
): PlatformLogger {
  return new PlatformLogger(
    pino(
      {
        level: options.level,
        base: { service: options.service, version: options.version, env: options.env },
        timestamp,
        messageKey: 'message',
      },
      destination,
    ),
  )
}

/** Подключает безопасный логгер к приложению NestJS. */
@Module({})
export class PlatformLoggerModule {
  /** Регистрирует зависимости модуля с переданными настройками. */
  static forRoot(options: LoggerOptions): DynamicModule {
    return {
      module: PlatformLoggerModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            autoLogging: false,
            level: options.level,
            base: { service: options.service, version: options.version, env: options.env },
            messageKey: 'message',
            timestamp,
          },
        }),
      ],
      providers: [
        {
          provide: PlatformLogger,
          useFactory: (logger: PinoLogger) => new PlatformLogger(logger.logger),
          inject: [PinoLogger],
        },
      ],
      exports: [PlatformLogger],
    }
  }
}
