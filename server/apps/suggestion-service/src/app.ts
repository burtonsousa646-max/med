// Запуск HTTP healthcheck и gRPC. Доступность кеша не определяет готовность сервиса.
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express'

import { Transport, type MicroserviceOptions } from '@nestjs/microservices'

import type { SuggestionConfig } from '@platform/config'
import { createPlatformLogger, PlatformLogger } from '@platform/logger'
import { HealthState } from '@platform/health'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'

import { SuggestionModule } from './suggestion.module.ts'
import { RedisSuggestionCache } from './infrastructure/cache'

/**
 * Собирает NestJS-приложение с HTTP healthcheck, Suggestion gRPC и стандартным gRPC health.
 * Порты открываются отдельным listen; соединение с необязательным кешем запускается в фоне.
 * Возвращает управляемый жизненный цикл для точки входа и интеграционных проверок.
 */
export async function createSuggestionApp(config: SuggestionConfig) {
  const logger = createPlatformLogger({
    service: 'suggestion-service',
    version: config.version,
    env: config.env,
    level: config.logLevel,
  })
  const app = await NestFactory.create<NestExpressApplication>(
    SuggestionModule.forRoot(config),
    new ExpressAdapter(),
    { logger, abortOnError: false },
  )

  app.useLogger(app.get(PlatformLogger))
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: `${config.grpc.host}:${config.grpc.port}`,
      package: ['platform.suggestion.v1', 'grpc.health.v1'],
      protoPath: [
        protoPath('suggestion/v1/suggestion.proto'),
        protoPath('grpc/health/v1/health.proto'),
      ],
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    },
  })

  const cache = app.get(RedisSuggestionCache)
  const health = app.get(HealthState)
  let closing: Promise<void> | undefined

  void cache.connection.connect().catch(() => {
    // Переподключением управляет адаптер; запросы смогут обойти недоступный кеш.
  })

  /**
   * Открывает оба транспорта и только затем помечает сервис готовым.
   * При ошибке запуска закрывает кеш и приложение, затем пробрасывает исключение.
   */
  async function listen(): Promise<void> {
    try {
      await app.startAllMicroservices()
      await app.listen(config.http.port, config.http.host)
      health.markReady()
    } catch (error) {
      cache.connection.close()
      await app.close()
      throw error
    }
  }

  /**
   * Снимает готовность до закрытия кеша и транспортов NestJS.
   */
  async function closeApplication(): Promise<void> {
    health.beginShutdown()
    cache.connection.close()
    await app.close()
  }

  /**
   * Начинает остановку один раз; повторные вызовы получают тот же Promise завершения.
   */
  function close(): Promise<void> {
    closing ??= closeApplication()
    return closing
  }

  return { app, health, cache, listen, close }
}
