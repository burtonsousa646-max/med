// Сборка сервиса: выбор адаптера источника выполняется один раз при запуске.
import { Module, type DynamicModule } from '@nestjs/common'

import { ConfigModule, SUGGESTION_CONFIG, type SuggestionConfig } from '@platform/config'

import { PlatformLogger, PlatformLoggerModule } from '@platform/logger'
import { HealthModule } from '@platform/health'

import { SuggestUseCase } from './application/suggest'
import type { SuggestionProvider } from './application/ports'
import { SuggestionController } from './presentation/grpc'
import { RedisSuggestionCache } from './infrastructure/cache'
import { DadataAdapter, DadataHttpClient } from './infrastructure/dadata'

import { StubSuggestionAdapter, OnPremStubTransport } from './infrastructure/stub'

import { DiagnosticReporter } from './infrastructure'

/**
 * Корневой модуль Suggestion: связывает сценарий с кешем, источником, часами и диагностикой.
 */
@Module({})
export class SuggestionModule {
  /**
   * Регистрирует зависимости по уже проверенной конфигурации.
   * Выбор источника выполняется при создании сценария и не меняется во время обработки запросов.
   */
  static forRoot(config: SuggestionConfig): DynamicModule {
    return {
      module: SuggestionModule,
      imports: [
        ConfigModule.forRoot({ config, token: SUGGESTION_CONFIG }),
        PlatformLoggerModule.forRoot({
          service: 'suggestion-service',
          version: config.version,
          env: config.env,
          level: config.logLevel,
        }),
        HealthModule.register({ serviceName: 'suggestion-service' }),
      ],
      controllers: [SuggestionController],
      providers: [
        {
          provide: RedisSuggestionCache,
          useFactory: () => new RedisSuggestionCache(config),
        },
        {
          provide: SuggestUseCase,
          inject: [RedisSuggestionCache, PlatformLogger],
          useFactory: (cache: RedisSuggestionCache, logger: PlatformLogger) => {
            const provider = createSuggestionProvider(config)
            const diagnostics = new DiagnosticReporter(logger)

            return new SuggestUseCase(
              provider,
              cache,
              (query) => cache.key(query),
              config.cacheTtlSec,
              { nowMs: () => Date.now() },
              diagnostics,
            )
          },
        },
      ],
      exports: [SuggestUseCase, RedisSuggestionCache],
    }
  }
}

/**
 * Выбирает локальную заглушку, имитацию внутренней DaData или облачный HTTP-транспорт.
 * Облачный режим требует URL и ключ; неверная конфигурация прерывает создание модуля.
 */
function createSuggestionProvider(config: SuggestionConfig): SuggestionProvider {
  if (config.provider === 'stub') {
    return new StubSuggestionAdapter()
  }

  if (config.provider === 'dadata-onprem-stub') {
    return new DadataAdapter('dadata-onprem-stub', new OnPremStubTransport())
  }

  if (!config.cloudUrl || !config.cloudApiKey) {
    throw new Error('Не настроен источник')
  }

  const transport = new DadataHttpClient(config.cloudUrl, config.cloudApiKey, config.timeoutMs)
  return new DadataAdapter('dadata-cloud', transport)
}
