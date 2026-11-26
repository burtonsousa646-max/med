import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

let processUnderTest: ChildProcess | undefined

/** Получает свободный локальный порт и освобождает его для запуска gateway. */
async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Нет адреса тестового порта')

  const port = address.port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })

  return port
}

describe('запуск процесса gateway', () => {
  afterEach(async () => {
    if (
      processUnderTest &&
      processUnderTest.exitCode === null &&
      processUnderTest.signalCode === null
    ) {
      // Подписываемся до сигнала, чтобы не пропустить быстрое завершение процесса.
      const exit = once(processUnderTest, 'exit')
      processUnderTest.kill('SIGTERM')
      await exit
    }

    processUnderTest = undefined
  })

  it('K1: процесс с неверной конфигурацией завершает запуск', async () => {
    processUnderTest = spawn(process.execPath, ['dist/main.js'], {
      env: { NODE_ENV: 'test', HTTP_PORT: 'invalid' },
      stdio: 'ignore',
    })

    const code = await new Promise<number | null>((resolve) => {
      processUnderTest!.once('exit', resolve)
    })

    expect(code).toBe(1)
  })

  it('K1, K3, K4: процесс запускается с конфигурацией и не публикует тестовые маршруты', async () => {
    const port = await availablePort()
    let grpcPort = await availablePort()
    while (grpcPort === port) grpcPort = await availablePort()

    // Недоступные зависимости подтверждают, что их готовность не блокирует запуск gateway.
    processUnderTest = spawn(process.execPath, ['dist/main.js'], {
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        HTTP_HOST: '127.0.0.1',
        HTTP_PORT: String(port),
        GRPC_HEALTH_PORT: String(grpcPort),
        UNLEASH_URL: 'http://127.0.0.1:1/api',
        UNLEASH_API_TOKEN: 'synthetic-token',
        SUGGESTION_GRPC_TARGET: '127.0.0.1:1',
        SUGGESTION_RATE_REDIS_URL: 'redis://127.0.0.1:1',
        SUGGESTION_RATE_HMAC_SECRET: 'synthetic-secret-at-least-32-characters',
      },
      stdio: 'ignore',
    })

    const base = `http://127.0.0.1:${port}`
    await vi.waitFor(
      async () => {
        expect(processUnderTest?.exitCode).toBeNull()
        expect((await fetch(`${base}/health/ready`)).status).toBe(200)
      },
      { timeout: 10000, interval: 50 },
    )

    expect((await fetch(`${base}/api/alpha/v1/items`)).status).toBe(404)
  })
})
