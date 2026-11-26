import { fileURLToPath } from 'node:url'
import { PactV4 } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'
import { GrpcPartnerProfiles } from '../../../../server/apps/auth-service/src/infrastructure/grpc'

const registrationId = '018f4ca0-f068-7762-8a00-000000000001'
const verifiedEmail = 'person@example.test'
const userId = '018f4ca0-f068-7762-8a00-000000000002'
const directory = fileURLToPath(new URL('../../../pacts/grpc', import.meta.url))
const proto = fileURLToPath(new URL('../../../proto/partners/v1/partners.proto', import.meta.url))

describe('Контракт Auth → Partners', () => {
  it('читает UUID профиля при первом вызове и при восстановлении регистрации', async () => {
    const pact = new PactV4({
      consumer: 'auth-service',
      provider: 'partners-service',
      dir: directory,
    })
    for (const state of ['ключ регистрации свободен', 'профиль уже создан для этого ключа']) {
      const responseValue =
        state === 'ключ регистрации свободен'
          ? "matching(regex, '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', '" +
            userId +
            "')"
          : userId
      await pact
        .addSynchronousInteraction('получить профиль: ' + state)
        .given(state)
        .usingPlugin({ plugin: 'protobuf', version: '0.8.1' })
        .withPluginContents(
          JSON.stringify({
            'pact:proto': proto,
            'pact:proto-service': 'PartnersService/EnsureUserProfile',
            'pact:content-type': 'application/protobuf',
            request: { registration_id: registrationId, verified_email: verifiedEmail },
            response: { user_id: responseValue },
          }),
          'application/grpc',
        )
        .startTransport('grpc', '127.0.0.1')
        .executeTest(async (transport) => {
          const client = new GrpcPartnerProfiles('127.0.0.1:' + String(transport.port), 3000)
          try {
            expect(await client.ensure(registrationId, verifiedEmail)).toBe(userId)
          } finally {
            client.onModuleDestroy()
          }
        })
    }
  })
})
