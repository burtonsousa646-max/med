import { readPartnersConfig } from '@platform/config'
import { createPlatformLogger } from '@platform/logger'
import { createPartnersApp } from './app.ts'
import { SERVICE_NAME } from './partners.module.ts'

const logger = createPlatformLogger({
  service: SERVICE_NAME,
  version: 'startup',
  env: 'startup',
  level: 'info',
})

try {
  const config = readPartnersConfig(process.env)
  const service = await createPartnersApp(config)
  await service.listen()
  let stopping = false

  /** Закрывает сервис по сигналу в пределах общего бюджета остановки. */
  function stop(): void {
    if (stopping) return
    stopping = true
    const deadline = setTimeout(() => process.exit(1), config.shutdownTimeoutMs)
    void service.close().then(
      () => {
        clearTimeout(deadline)
        process.exitCode = 0
      },
      () => {
        clearTimeout(deadline)
        logger.event('failure', {}, 'error')
        process.exitCode = 1
      },
    )
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
} catch {
  logger.event('failure', {}, 'error')
  process.exitCode = 1
}
