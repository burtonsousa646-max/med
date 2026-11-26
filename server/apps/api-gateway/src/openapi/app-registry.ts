import { fileURLToPath } from 'node:url'
import { PlatformFeatureFlagsController } from '../feature-flags.ts'
import { createSuggestionsController } from '../suggestions'
import type { AppDefinition } from './registry.types.ts'

/** Создаёт реестр приложений по упакованным контрактам OpenAPI. */
export function createAppRegistry(
  folder: URL = new URL('./', import.meta.url),
): readonly AppDefinition[] {
  const suggestions = createSuggestionsController('platform')
  const operations = [
    ['parties', 'suggestParties'],
    ['addresses', 'suggestAddresses'],
    ['banks', 'suggestBanks'],
    ['emails', 'suggestEmails'],
  ].map(([kind, handler]) => ({
    operationId: handler ?? '',
    method: 'POST',
    rateLimit: true,
    path: `/v1/suggestions/${kind ?? ''}`,
    controller: suggestions,
    handler: handler ?? '',
  }))
  return [
    {
      id: 'platform',
      prefix: '/api',
      documentFile: fileURLToPath(new URL('platform.json', folder)),
      operations: [
        ...operations,
        {
          operationId: 'getFeatureFlags',
          method: 'GET',
          path: '/v1/feature-flags/{web-app}',
          controller: PlatformFeatureFlagsController,
          handler: 'getFeatureFlags',
        },
      ],
    },
  ]
}

// Базовая фабрика остаётся пригодной для проверки пустого реестра; приложения подключает main.
export const APP_REGISTRY: readonly AppDefinition[] = Object.freeze([])
