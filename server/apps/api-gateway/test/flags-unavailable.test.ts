import { readGatewayConfig } from '@platform/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'reflect-metadata'
import { expect, it, vi } from 'vitest'
import { createGateway } from '../src/app'
import { createFeatureFlagsController } from '../src/feature-flags.ts'

it('K8: недоступный Unleash даёт false без потери готовности', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'gateway-flags-'))
  let gateway: Awaited<ReturnType<typeof createGateway>> | undefined

  try {
    const documentFile = join(folder, 'flags.json')
    await writeFile(
      documentFile,
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'flags', version: '1' },
        servers: [{ url: '/api/flags' }],
        paths: {
          '/v1/feature-flags': {
            get: {
              operationId: 'getFeatureFlags',
              security: [],
              responses: { 200: { description: 'ok' } },
            },
          },
        },
        components: {
          schemas: {
            FeatureFlags: { type: 'object', properties: { 'flags.test': { type: 'boolean' } } },
          },
        },
      }),
    )

    // Пустой каталог исключает результат из ранее сохранённого SDK-кеша.
    vi.stubEnv('UNLEASH_URL', 'http://127.0.0.1:1/api')
    vi.stubEnv('UNLEASH_API_TOKEN', 'synthetic-token')
    vi.stubEnv('UNLEASH_BACKUP_PATH', folder)
    const config = readGatewayConfig(process.env)
    const controller = createFeatureFlagsController('flags')
    gateway = await createGateway({
      config,
      apps: [
        {
          id: 'flags',
          documentFile,
          operations: [
            {
              operationId: 'getFeatureFlags',
              method: 'GET',
              path: '/v1/feature-flags',
              controller,
              handler: 'getFeatureFlags',
            },
          ],
        },
      ],
    })
    await gateway.app.listen(0, '127.0.0.1')
    gateway.health.markReady()

    const base = await gateway.app.getUrl()
    const response = await fetch(`${base}/api/flags/v1/feature-flags`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ 'flags.test': false })
    expect((await fetch(`${base}/health/ready`)).status).toBe(200)
  } finally {
    await gateway?.close()
    vi.unstubAllEnvs()
    await rm(folder, { recursive: true, force: true })
  }
})
