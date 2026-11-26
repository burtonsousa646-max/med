// Тестовый процесс использует реальный gateway и удерживает один прикладной запрос.
import { Controller, Get } from '@nestjs/common'
import { readGatewayConfig } from '@platform/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'reflect-metadata'
import { createGateway } from '../../dist/app.js'

/** Имитирует долгую операцию для проверки дренирования. */
class HoldController {
  /** Сообщает родительскому процессу о начатом запросе и ожидает отключения. */
  hold() {
    process.send?.({ event: 'started' })
    return new Promise(() => {})
  }
}

Controller('/api/shutdown')(HoldController)
Get('/v1/hold')(
  HoldController.prototype,
  'hold',
  Object.getOwnPropertyDescriptor(HoldController.prototype, 'hold'),
)

const folder = await mkdtemp(join(tmpdir(), 'gateway-shutdown-process-'))
const documentFile = join(folder, 'shutdown.json')
await writeFile(
  documentFile,
  JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'shutdown', version: '1' },
    servers: [{ url: '/api/shutdown' }],
    paths: {
      '/v1/hold': {
        get: { operationId: 'hold', security: [], responses: { 200: { description: 'ok' } } },
      },
    },
  }),
)
const config = readGatewayConfig({
  UNLEASH_URL: 'http://127.0.0.1:1/api',
  UNLEASH_API_TOKEN: 'synthetic',
  LOG_LEVEL: 'error',
  SHUTDOWN_TIMEOUT_MS: '3000',
  HTTP_REQUEST_TIMEOUT_MS: '5000',
  GRPC_CALL_TIMEOUT_MS: '1000',
})
const gateway = await createGateway({
  config,
  testFlags: {},
  apps: [
    {
      id: 'shutdown',
      documentFile,
      operations: [
        {
          operationId: 'hold',
          method: 'GET',
          path: '/v1/hold',
          controller: HoldController,
          handler: 'hold',
        },
      ],
    },
  ],
})
await gateway.app.listen(0, '127.0.0.1')
gateway.health.markReady()
process.send?.({ event: 'ready', base: await gateway.app.getUrl() })
let stopping = false

/** Переводит процесс в остановку один раз при повторных сигналах. */
function stop() {
  if (stopping) return
  stopping = true
  process.send?.({ event: 'stopping' })
  void gateway.close().then(
    async () => {
      await rm(folder, { recursive: true, force: true })
      process.send?.({ event: 'closed' })
      process.exit(0)
    },
    async () => {
      await rm(folder, { recursive: true, force: true })
      process.exit(1)
    },
  )
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
