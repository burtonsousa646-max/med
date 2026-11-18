import { DynamicModule, Module } from '@nestjs/common'

import { readFeatureFlagsConfig } from './config.js'
import { createUnleash, FeatureFlagsClient } from './feature-flags.client.js'
import { InMemoryFeatureFlags } from './in-memory-feature-flags.js'

/**
 * Модуль флагов. Глобальный: сервис подключает его один раз в корневом модуле,
 * сценарии получают FeatureFlagsClient через порт флагов сервиса.
 */
@Module({})
export class FeatureFlagsModule {
  /**
   * Клиент Unleash с конфигурацией из env. Неверная конфигурация — сервис не стартует;
   * недоступный Unleash старт не задерживает.
   */
  static forRoot(options: { appName: string }): DynamicModule {
    return {
      module: FeatureFlagsModule,
      global: true,
      providers: [
        {
          provide: FeatureFlagsClient,
          useFactory: () =>
            new FeatureFlagsClient(createUnleash(options.appName, readFeatureFlagsConfig())),
        },
      ],
      exports: [FeatureFlagsClient],
    }
  }

  /** InMemoryFeatureFlags под токеном FeatureFlagsClient: интеграционные тесты сервисов не ходят в Unleash. */
  static forTesting(enabled?: Record<string, boolean>): DynamicModule {
    return {
      module: FeatureFlagsModule,
      global: true,
      providers: [{ provide: FeatureFlagsClient, useValue: new InMemoryFeatureFlags(enabled) }],
      exports: [FeatureFlagsClient],
    }
  }
}
