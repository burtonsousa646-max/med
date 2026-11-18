import { fileURLToPath } from 'node:url'
import { createFeatureFlagsController } from '../feature-flags.ts'
import { createSuggestionsController } from '../suggestions'
import type { AppDefinition } from './registry.types.ts'

/** Создаёт реестр приложений по упакованным контрактам OpenAPI. */
export function createAppRegistry(
  folder: URL = new URL('./', import.meta.url),
): readonly AppDefinition[] {
  return ['landing', 'cabinet', 'backoffice'].map((id) => {
    const suggestions = createSuggestionsController(id)
    const flags = createFeatureFlagsController(id)
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
    return {
      id,
      documentFile: fileURLToPath(new URL(`${id}.json`, folder)),
      operations: [
        ...operations,
        {
          operationId: 'getFeatureFlags',
          method: 'GET',
          path: '/v1/feature-flags',
          controller: flags,
          handler: 'getFeatureFlags',
        },
      ],
    }
  })
}

// Базовая фабрика остаётся пригодной для проверки пустого реестра; приложения подключает main.
export const APP_REGISTRY: readonly AppDefinition[] = Object.freeze([])
