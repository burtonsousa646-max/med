import { createServer, type AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Verifier } from '@pact-foundation/pact'
import { describe, it } from 'vitest'
import { readPartnersConfig } from '../../../../server/shared/config/src'
import { createPartnersApp } from '../../../../server/apps/partners-service/src/app.ts'
import {
  PARTNERS_DATABASE,
  type PartnersDatabase,
} from '../../../../server/apps/partners-service/src/infrastructure/prisma'

/** Назначает свободный порт реальному gRPC-серверу Partners. */
async function availablePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    }),
  )
  return port
}

describe('Partners выполняет контракт Auth', () => {
  it('возвращает стабильную идентичность в обоих состояниях поставщика', async () => {
    const databaseUrl = process.env['TEST_PARTNERS_DATABASE_URL']
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
      throw new Error('Требуется отдельная TEST_PARTNERS_DATABASE_URL с суффиксом _test')
    const grpc = { host: '127.0.0.1', port: await availablePort() }
    const config = readPartnersConfig({
      PARTNERS_DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    })
    const app = await createPartnersApp({ ...config, http: { host: '127.0.0.1', port: 0 }, grpc })
    const db = app.app.get<PartnersDatabase>(PARTNERS_DATABASE)
    const registrationId = '018f4ca0-f068-7762-8a00-000000000001'
    const data = {
      registrationId,
      id: '018f4ca0-f068-7762-8a00-000000000002',
      registrationEmail: 'person@example.test',
      contactEmail: 'updated@example.test',
    }
    try {
      await app.listen()
      await new Verifier({
        provider: 'partners-service',
        providerBaseUrl: await app.app.getUrl(),
        transports: [{ protocol: 'grpc', port: grpc.port }],
        pactUrls: [
          fileURLToPath(
            new URL('../../../pacts/grpc/auth-service-partners-service.json', import.meta.url),
          ),
        ],
        stateHandlers: {
          'ключ регистрации свободен': async () => {
            await db.userProfile.deleteMany({ where: { registrationId } })
          },
          'профиль уже создан для этого ключа': async () => {
            await db.$transaction([
              db.userProfile.deleteMany({ where: { registrationId } }),
              db.userProfile.create({ data }),
            ])
          },
        },
      }).verifyProvider()
    } finally {
      await app.close()
    }
  })
})
