import { pathToFileURL } from 'node:url'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { readGatewayConfig } from '@platform/config'
import { describe, expect, it } from 'vitest'
import { createGateway } from '../src/app.ts'
import { SuggestionGrpcClient } from '../src/clients/suggestion/index.ts'
import { createAppRegistry, OpenApiRegistry } from '../src/openapi/index.ts'

describe('Общий API платформы', () => {
  it('выбирает из контракта только флаги запрошенного приложения', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'platform-flags-'))
    try {
      const document = JSON.parse(
        await readFile(resolve('dist/openapi/platform.json'), 'utf8'),
      ) as {
        components: { schemas: Record<string, { properties: Record<string, unknown> }> }
      }
      document.components.schemas['LandingFeatureFlags']!.properties = {
        'landing.example': { type: 'boolean' },
      }
      document.components.schemas['AppFeatureFlags']!.properties = {
        'app.example': { type: 'boolean' },
      }
      await writeFile(join(folder, 'platform.json'), JSON.stringify(document))
      const registry = new OpenApiRegistry(createAppRegistry(pathToFileURL(folder + '/')))
      expect(registry.getPlatformFeatureFlagNames('landing')).toEqual(['landing.example'])
      expect(registry.getPlatformFeatureFlagNames('app')).toEqual(['app.example'])
      expect(registry.getPlatformFeatureFlagNames('__proto__')).toBeUndefined()
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('выдаёт флаги и подсказки на общих маршрутах и закрывает прежние префиксы', async () => {
    const config = readGatewayConfig({
      UNLEASH_URL: 'http://127.0.0.1:1/api',
      UNLEASH_API_TOKEN: 'test',
      LOG_LEVEL: 'error',
    })
    const gateway = await createGateway({
      config,
      apps: createAppRegistry(pathToFileURL(resolve('dist/openapi') + '/')),
      testFlags: {},
      validateResponses: true,
      providers: [
        {
          provide: SuggestionGrpcClient,
          useValue: { suggestParties: () => Promise.resolve({ items: [] }) },
        },
      ],
      beforeRequest: () => Promise.resolve(),
    })
    try {
      await gateway.app.listen(0, '127.0.0.1')
      gateway.health.markReady()
      const base = await gateway.app.getUrl()
      for (const name of ['landing', 'app', 'backoffice']) {
        const response = await fetch(`${base}/api/v1/feature-flags/${name}`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({})
      }
      const suggestions = await fetch(`${base}/api/v1/suggestions/parties`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'тест' }),
      })
      expect(suggestions.status).toBe(200)
      expect(await suggestions.json()).toEqual({ items: [] })
      expect((await fetch(`${base}/api/v1/feature-flags/unknown`)).status).toBe(404)
      for (const name of ['landing', 'cabinet', 'backoffice']) {
        expect((await fetch(`${base}/api/${name}/v1/feature-flags`)).status).toBe(404)
        for (const kind of ['parties', 'addresses', 'banks', 'emails']) {
          const oldRoute = await fetch(`${base}/api/${name}/v1/suggestions/${kind}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'тест' }),
          })
          expect(oldRoute.status).toBe(404)
        }
      }
    } finally {
      await gateway.close()
    }
  })
})
