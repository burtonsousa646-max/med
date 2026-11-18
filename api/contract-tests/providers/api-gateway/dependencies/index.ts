// Зависимости тестового окружения Gateway и сервиса подсказок.
export {
  readGatewayConfig,
  readSuggestionConfig,
} from '../../../../../server/shared/config/src/index.ts'
export { createSuggestionApp } from '../../../../../server/apps/suggestion-service/src'
export { createGateway } from '../../../../../server/apps/api-gateway/src/app.ts'
export { createAppRegistry } from '../../../../../server/apps/api-gateway/src/openapi/app-registry.ts'
export { SuggestionGrpcClient } from '../../../../../server/apps/api-gateway/src/clients/suggestion/suggestion.client.ts'
export {
  RedisRateLimiter,
  RateLimitedError,
} from '../../../../../server/apps/api-gateway/src/rate-limit/rate-limiter.ts'
export { ClientIdentityResolver } from '../../../../../server/apps/api-gateway/src/client-identity/client-identity.ts'
