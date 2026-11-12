import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readFeatureFlagsConfig } from './config.js'

const TOKEN = 'default:development.synthetic-secret-token'

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    UNLEASH_URL: 'http://localhost:4242/api',
    UNLEASH_API_TOKEN: TOKEN,
    ...overrides,
  }
}

function errorMessage(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof Error) return error.message
  }
  throw new Error('ожидалась ошибка конфигурации')
}

describe('readFeatureFlagsConfig (К1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('читает адрес и токен, необязательные переменные берёт по умолчанию', () => {
    const config = readFeatureFlagsConfig(env())

    expect(config).toEqual({
      url: 'http://localhost:4242/api',
      apiToken: TOKEN,
      backupPath: tmpdir(),
      refreshIntervalMs: 15_000,
    })
  })

  it('читает каталог backup-файла и период обновления', () => {
    const config = readFeatureFlagsConfig(
      env({ UNLEASH_BACKUP_PATH: '/var/cache/unleash', UNLEASH_REFRESH_INTERVAL_MS: '5000' }),
    )

    expect(config.backupPath).toBe('/var/cache/unleash')
    expect(config.refreshIntervalMs).toBe(5000)
  })

  it('принимает адрес https', () => {
    const config = readFeatureFlagsConfig(env({ UNLEASH_URL: 'https://unleash.example.test/api' }))

    expect(config.url).toBe('https://unleash.example.test/api')
  })

  it.each([undefined, '', '   '])('требует UNLEASH_URL — значение %j', (value) => {
    expect(() => readFeatureFlagsConfig(env({ UNLEASH_URL: value }))).toThrow(
      'Переменная UNLEASH_URL не задана',
    )
  })

  it.each(['localhost:4242/api', '/api', 'ftp://localhost/api', 'не адрес'])(
    'отклоняет UNLEASH_URL не http и не https — %j',
    (value) => {
      expect(() => readFeatureFlagsConfig(env({ UNLEASH_URL: value }))).toThrow(
        'Переменная UNLEASH_URL должна быть абсолютным адресом http или https',
      )
    },
  )

  it.each([undefined, '', '   '])('требует UNLEASH_API_TOKEN — значение %j', (value) => {
    expect(() => readFeatureFlagsConfig(env({ UNLEASH_API_TOKEN: value }))).toThrow(
      'Переменная UNLEASH_API_TOKEN не задана',
    )
  })

  it.each(['0', '-100', '1.5', '15s', 'abc', '99999999999999999999'])(
    'отклоняет UNLEASH_REFRESH_INTERVAL_MS — %j',
    (value) => {
      expect(() => readFeatureFlagsConfig(env({ UNLEASH_REFRESH_INTERVAL_MS: value }))).toThrow(
        'Переменная UNLEASH_REFRESH_INTERVAL_MS должна быть целым числом больше нуля',
      )
    },
  )

  it.each([
    ['UNLEASH_URL', `ftp://${TOKEN}@localhost/api`],
    ['UNLEASH_REFRESH_INTERVAL_MS', TOKEN],
  ])('не пишет значение %s в текст ошибки: токен — секрет', (name, value) => {
    const message = errorMessage(() => readFeatureFlagsConfig(env({ [name]: value })))

    expect(message).toContain(name)
    expect(message).not.toContain(TOKEN)
  })

  it('по умолчанию читает process.env', () => {
    vi.stubEnv('UNLEASH_URL', 'http://127.0.0.1:4242/api')
    vi.stubEnv('UNLEASH_API_TOKEN', TOKEN)
    vi.stubEnv('UNLEASH_BACKUP_PATH', undefined)
    vi.stubEnv('UNLEASH_REFRESH_INTERVAL_MS', undefined)

    const config = readFeatureFlagsConfig()

    expect(config.url).toBe('http://127.0.0.1:4242/api')
  })
})
