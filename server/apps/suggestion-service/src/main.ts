import type { SuggestionApplication } from './main.types.ts'

// Точка входа: конфигурация из окружения и ограниченное по времени завершение процесса.
import { readSuggestionConfig } from '@platform/config'
import { createPlatformLogger } from '@platform/logger'

import { createSuggestionApp } from './app.ts'

const logger = createPlatformLogger({
  service: 'suggestion-service',
  version: 'startup',
  env: 'startup',
  level: 'info',
})

try {
  const config = readSuggestionConfig(process.env)
  const service = await createSuggestionApp(config)

  await service.listen()
  registerShutdown(service, config.shutdownTimeoutMs)
} catch {
  // Значения env и исходное исключение могут содержать секреты.
  logger.event('failure', {}, 'error')
  process.exitCode = 1
}

/**
 * Подписывает SIGTERM и SIGINT на однократную остановку сервиса.
 * Успешное закрытие завершает процесс с кодом 0; ошибка или превышение бюджета — с кодом 1.
 */
function registerShutdown(service: SuggestionApplication, timeoutMs: number): void {
  let stopping = false

  /**
   * Запускает ограниченное по времени закрытие; повторный сигнал не создаёт второй таймер.
   */
  const stop = () => {
    if (stopping) return
    stopping = true

    const shutdownTimer = setTimeout(() => {
      process.exit(1)
    }, timeoutMs)

    /**
     * Убирает аварийный таймер перед выходом по результату закрытия приложения.
     */
    const finish = (exitCode: number) => {
      clearTimeout(shutdownTimer)
      process.exit(exitCode)
    }

    void service.close().then(
      () => {
        finish(0)
      },
      () => {
        finish(1)
      },
    )
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
