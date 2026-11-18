// Кеш флагов при недоступном Unleash (К3): память SDK и backup-файл в backupPath.
// Сеть — только к локальному HTTP-серверу, который поднимает сам тест. Пауз нет: тест ждёт событий SDK.
import 'reflect-metadata'

import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Logger, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { Unleash } from 'unleash-client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { createUnleash, FeatureFlagsClient } from './feature-flags.client.js'
import { FeatureFlagsModule } from './feature-flags.module.js'

const FLAG = 'campaigns.launch.new-checkout'
const APP_NAME = 'feature-flags-cache-spec'
const API_TOKEN = 'default:development.synthetic-cache-spec-token'
/** Начало текста ошибки получения флагов; ошибки метрик SDK начинаются иначе. */
const UNLEASH_REPOSITORY_ERROR = 'Unleash Repository error'

/** Ответ как у Unleash 8 на `GET /api/client/features`: флаг включён стратегией default. */
const FEATURES_RESPONSE = {
  version: 2,
  features: [
    {
      name: FLAG,
      enabled: true,
      strategies: [{ name: 'default', constraints: [], parameters: {} }],
    },
  ],
}

interface FakeUnleashServer {
  url: string
  featureRequests: IncomingHttpHeaders[]
  stop(): Promise<void>
}

/** Локальный сервер Unleash: отдаёт флаги, регистрацию и метрики принимает без проверки. */
async function startServer(): Promise<FakeUnleashServer> {
  const featureRequests: IncomingHttpHeaders[] = []
  const server = createServer((request, response) => {
    request.resume()
    if (request.method === 'GET' && request.url?.startsWith('/api/client/features')) {
      featureRequests.push(request.headers)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(FEATURES_RESPONSE))
      return
    }
    response.writeHead(202).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  let stopped = false
  return {
    url: `http://127.0.0.1:${port}/api`,
    featureRequests,
    async stop() {
      if (stopped) return
      stopped = true
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

/** Адрес, по которому сервер уже остановлен: Unleash недоступен. */
async function stoppedServerUrl(): Promise<string> {
  const server = await startServer()
  await server.stop()
  return server.url
}

/** Ждёт событие SDK; для `error` — только ошибку получения флагов, а не метрик. */
function nextEvent(
  emitter: EventEmitter,
  event: 'synchronized' | 'ready' | 'error',
): Promise<void> {
  return new Promise<void>((resolve) => {
    const listener = (payload: unknown) => {
      if (
        event === 'error' &&
        !(payload instanceof Error && payload.message.startsWith(UNLEASH_REPOSITORY_ERROR))
      ) {
        return
      }
      emitter.off(event, listener)
      resolve()
    }
    emitter.on(event, listener)
  })
}

/**
 * Периоды обновления в тестах.
 *
 * SDK unleash-client 6.12.2 после destroy() снимает свои обработчики, и запрос флагов, который
 * упал уже после остановки, превращается в необработанную ошибку. Поэтому клиент останавливается,
 * только когда запроса в полёте нет: сразу после синхронизации или после ошибки получения флагов,
 * а период обновления заведомо длиннее остатка теста.
 */
const NO_REFRESH_MS = 60_000
const REFRESH_MS = 1_000

// Ошибку получения флагов SDK выдаёт после своих повторов запроса — это несколько секунд.
describe('кеш флагов при недоступном Unleash (К3)', { timeout: 20_000 }, () => {
  const servers: FakeUnleashServer[] = []
  const clients: FeatureFlagsClient[] = []
  const directories: string[] = []
  let warn: MockInstance<Logger['warn']>

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(async () => {
    for (const client of clients.splice(0)) client.onModuleDestroy()
    await Promise.all(servers.splice(0).map((server) => server.stop()))
    await Promise.all(
      directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    )
    vi.unstubAllEnvs()
  })

  async function server(): Promise<FakeUnleashServer> {
    const started = await startServer()
    servers.push(started)
    return started
  }

  async function backupDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'feature-flags-cache-'))
    directories.push(path)
    return path
  }

  function client(
    url: string,
    backupPath: string,
    refreshIntervalMs: number,
  ): { client: FeatureFlagsClient; sdk: Unleash } {
    const sdk = createUnleash(APP_NAME, { url, apiToken: API_TOKEN, backupPath, refreshIntervalMs })
    const created = new FeatureFlagsClient(sdk)
    clients.push(created)
    return { client: created, sdk }
  }

  /** Ждёт, пока SDK допишет backup-файл с флагом: запись идёт после события синхронизации. */
  async function waitForBackup(backupPath: string): Promise<void> {
    await vi.waitFor(async () => {
      const [file] = await readdir(backupPath)
      if (!file) throw new Error('backup-файла ещё нет')
      const backup = JSON.parse(await readFile(join(backupPath, file), 'utf8')) as {
        features: { name: string }[]
      }
      expect(backup.features.map((feature) => feature.name)).toContain(FLAG)
    })
  }

  /** Ждёт записи в лог об ошибке получения флагов — для модуля, у которого нет доступа к SDK. */
  function nextLoggedRepositoryError(): Promise<void> {
    return new Promise<void>((resolve) => {
      warn.mockImplementation((message: unknown) => {
        if (String(message).startsWith(UNLEASH_REPOSITORY_ERROR)) resolve()
      })
    })
  }

  it('после синхронизации с Unleash флаг включён', async () => {
    const unleash = await server()
    const backupPath = await backupDirectory()
    const { client: flags, sdk } = client(unleash.url, backupPath, NO_REFRESH_MS)

    await nextEvent(sdk, 'synchronized')
    await waitForBackup(backupPath)

    expect(flags.isEnabled(FLAG)).toBe(true)
    expect(unleash.featureRequests[0]?.authorization).toBe(API_TOKEN)
  })

  it('после остановки Unleash флаг по-прежнему включён — из памяти SDK', async () => {
    const unleash = await server()
    const { client: flags, sdk } = client(unleash.url, await backupDirectory(), REFRESH_MS)
    await nextEvent(sdk, 'synchronized')
    const failedRefresh = nextEvent(sdk, 'error')

    await unleash.stop()
    await failedRefresh

    expect(flags.isEnabled(FLAG)).toBe(true)
  })

  it('новый клиент с тем же backupPath при остановленном Unleash читает флаг из backup-файла', async () => {
    const unleash = await server()
    const backupPath = await backupDirectory()
    const first = client(unleash.url, backupPath, NO_REFRESH_MS)
    await nextEvent(first.sdk, 'synchronized')
    await waitForBackup(backupPath)
    first.client.onModuleDestroy()
    await unleash.stop()

    const second = client(unleash.url, backupPath, REFRESH_MS)
    await nextEvent(second.sdk, 'ready')

    expect(second.sdk.isSynchronized()).toBe(false)
    expect(second.client.isEnabled(FLAG)).toBe(true)
    // Остановка — только после неудачного запроса: см. NO_REFRESH_MS и REFRESH_MS.
    await nextEvent(second.sdk, 'error')
  })

  it('без backup-файла при остановленном Unleash флаг выключен', async () => {
    const { client: flags, sdk } = client(
      await stoppedServerUrl(),
      await backupDirectory(),
      REFRESH_MS,
    )

    await nextEvent(sdk, 'error')

    expect(flags.isEnabled(FLAG)).toBe(false)
  })

  it('недоступный Unleash не роняет процесс: ошибка SDK уходит в лог на уровне warn без токена', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { sdk } = client(await stoppedServerUrl(), await backupDirectory(), REFRESH_MS)

    await nextEvent(sdk, 'error')

    const messages = warn.mock.calls.map(([message]) => String(message))
    expect(messages.some((message) => message.startsWith(UNLEASH_REPOSITORY_ERROR))).toBe(true)
    expect(messages.every((message) => !message.includes(API_TOKEN))).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('FeatureFlagsModule.forRoot стартует без Unleash, флаги выключены', async () => {
    vi.stubEnv('UNLEASH_URL', await stoppedServerUrl())
    vi.stubEnv('UNLEASH_API_TOKEN', API_TOKEN)
    vi.stubEnv('UNLEASH_BACKUP_PATH', await backupDirectory())
    vi.stubEnv('UNLEASH_REFRESH_INTERVAL_MS', String(NO_REFRESH_MS))
    @Module({ imports: [FeatureFlagsModule.forRoot({ appName: APP_NAME })] })
    class TestAppModule {}
    const failedFetch = nextLoggedRepositoryError()

    const app = await NestFactory.createApplicationContext(TestAppModule, { logger: false })
    try {
      expect(app.get(FeatureFlagsClient).isEnabled(FLAG)).toBe(false)
    } finally {
      await failedFetch
      await app.close()
    }
  })
})
