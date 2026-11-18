import { readGatewayConfig } from '@platform/config'
import { createPlatformLogger } from '@platform/logger'
import { createGateway } from './app.ts'
import { ClientIdentityResolver } from './client-identity'
import { SuggestionGrpcClient } from './clients/suggestion'
import { createAppRegistry } from './openapi'
import { RateDiagnostics, RateLimitedError, RedisRateLimiter } from './rate-limit'
let logger = createPlatformLogger({
  service: 'api-gateway',
  version: 'startup',
  env: 'startup',
  level: 'info',
})
let cleanup: () => void = () => {}
try {
  const config = readGatewayConfig(process.env, { suggestions: true })
  const settings = config.suggestions
  if (!settings) throw new Error('Не настроены подсказки')
  const reporter = new RateDiagnostics(() => logger)
  const limiter = new RedisRateLimiter(settings, (result) => {
    reporter.record(result)
  })
  const identities = new ClientIdentityResolver(settings.trustedProxies)
  const client = new SuggestionGrpcClient(settings.target, config.grpc.callTimeoutMs)
  cleanup = () => {
    limiter.connection.close()
    client.close()
  }
  const gateway = await createGateway({
    config,
    apps: createAppRegistry(),
    providers: [{ provide: SuggestionGrpcClient, useValue: client }],
    /** Проверяет общий лимит до обработки операции подсказок. */
    async beforeRequest(request, response, operation, scope) {
      if (operation.operation['x-suggestion-rate-limit'] !== true) return
      try {
        await limiter.assertAllowed(
          await identities.resolve(request),
          scope.requestId,
          scope.signal,
        )
      } catch (error) {
        if (error instanceof RateLimitedError)
          response.setHeader('Retry-After', String(error.retryAfterSeconds))
        throw error
      }
    },
    close: () => {
      cleanup()
      return Promise.resolve()
    },
  })
  logger = gateway.logger
  void limiter.connection.connect().catch(() => {
    reporter.record('rate_redis_unavailable')
  })
  await gateway.listen()
  logger.event('startup', {})
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    logger.event('shutdown', {})
    void gateway.close().then(
      () => {
        process.exit(0)
      },
      () => {
        process.exit(1)
      },
    )
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
} catch {
  cleanup()
  logger.event('failure', {}, 'error')
  process.exit(1)
}
