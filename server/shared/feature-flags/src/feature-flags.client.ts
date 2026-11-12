// Клиент флагов для сервисов и API Gateway — обёртка над SDK unleash-client (ADR 0001).
// Флаги вычисляются в процессе из кеша SDK: память и backup-файл в backupPath ведёт сам SDK.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { type Context, Unleash, UnleashEvents } from 'unleash-client'

import type { FeatureFlagsConfig } from './config.js'
import type { FeatureFlagsReader, FlagContext } from './types.js'

/**
 * Создаёт SDK Unleash. Не ждёт синхронизации: сервис стартует, даже если Unleash недоступен.
 * Обработчики событий навешивает FeatureFlagsClient.
 */
export function createUnleash(appName: string, config: FeatureFlagsConfig): Unleash {
  return new Unleash({
    url: config.url,
    appName,
    customHeaders: { Authorization: config.apiToken },
    refreshInterval: config.refreshIntervalMs,
    backupPath: config.backupPath,
    disableMetrics: false,
  })
}

@Injectable()
export class FeatureFlagsClient implements FeatureFlagsReader, OnModuleDestroy {
  private readonly logger = new Logger('FeatureFlags')

  constructor(private readonly unleash: Unleash) {
    // Без обработчика `error` SDK роняет процесс. В лог — только текст ошибки:
    // без токена, заголовков и тела ответа.
    unleash.on(UnleashEvents.Error, (error: unknown) => {
      this.logger.warn(messageOf(error))
    })
    unleash.on(UnleashEvents.Warn, (warning: unknown) => {
      this.logger.warn(messageOf(warning))
    })
  }

  /** Флаг включён? Неизвестный флаг и флаг без кеша — `false`. */
  isEnabled(name: string, context: FlagContext = {}): boolean {
    return this.unleash.isEnabled(name, toUnleashContext(context), false)
  }

  onModuleDestroy(): void {
    this.unleash.destroy()
  }
}

/** В контекст Unleash попадают только переданные `userId` и `companyId`. */
function toUnleashContext({ userId, companyId }: FlagContext): Context {
  const context: Context = {}
  if (userId !== undefined) context.userId = userId
  if (companyId !== undefined) context.properties = { companyId }
  return context
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  return typeof value === 'string' ? value : 'неизвестная ошибка Unleash'
}
