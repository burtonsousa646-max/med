import { fileURLToPath } from 'node:url'
import { PactV4 } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'
import { contractNotificationsClient } from '../../../../server/apps/auth-service/test/contract-notifications-client.ts'

const dispatchId = '018f4ca0-f068-7762-8a00-000000000001'
const directory = fileURLToPath(new URL('../../../pacts/grpc', import.meta.url))
const proto = fileURLToPath(
  new URL('../../../proto/notifications/v1/notifications.proto', import.meta.url),
)

describe('Контракт Auth → Notifications', () => {
  it('передаёт неизменный UUID, адрес, код и срок письма', async () => {
    const pact = new PactV4({
      consumer: 'auth-service',
      provider: 'notifications-service',
      dir: directory,
    })
    await pact
      .addSynchronousInteraction('передать код по email')
      .given('новое поручение Auth может быть отправлено')
      .usingPlugin({ plugin: 'protobuf', version: '0.8.1' })
      .withPluginContents(
        JSON.stringify({
          'pact:proto': proto,
          'pact:proto-service': 'NotificationsService/SendNotification',
          'pact:content-type': 'application/protobuf',
          request: {
            dispatch_id: dispatchId,
            text: 'Код подтверждения: 123456',
            email: 'person@example.test',
            channels: ['NOTIFICATION_CHANNEL_EMAIL'],
            expires_at: { seconds: '4102444800', nanos: 0 },
          },
          response: {
            dispatch_id: dispatchId,
            results: [
              {
                channel: 'NOTIFICATION_CHANNEL_EMAIL',
                status: 'SUBMISSION_STATUS_SENT',
                retryable: false,
              },
            ],
          },
        }),
        'application/grpc',
      )
      .startTransport('grpc', '127.0.0.1')
      .executeTest(async (transport) => {
        const client = contractNotificationsClient(transport.port)
        try {
          const response = await client.send(
            dispatchId,
            'person@example.test',
            '123456',
            new Date(4102444800000),
            null,
          )
          expect(response.dispatchId).toBe(dispatchId)
          expect(response.results[0]?.status).toBe('SUBMISSION_STATUS_SENT')
        } finally {
          client.onModuleDestroy()
        }
      })
  })
})
