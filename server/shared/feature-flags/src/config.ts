// Конфигурация клиента Unleash из переменных окружения — specs/architecture/tech-stack.md, раздел «Feature toggles».
// Пакета @platform/config пока нет, поэтому переменные читает сам пакет; переход — отдельной задачей.
import { tmpdir } from 'node:os'

export interface FeatureFlagsConfig {
  /** UNLEASH_URL — адрес API Unleash, например `http://localhost:4242/api`. */
  url: string
  /** UNLEASH_API_TOKEN — backend-токен окружения. Секрет: не попадает в логи и тексты ошибок. */
  apiToken: string
  /** UNLEASH_BACKUP_PATH — каталог backup-файла кеша, по умолчанию временный каталог ОС. */
  backupPath: string
  /** UNLEASH_REFRESH_INTERVAL_MS — период обновления флагов, по умолчанию 15000. */
  refreshIntervalMs: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 15_000

/**
 * Читает и проверяет конфигурацию. Неверная конфигурация — `Error` с именем переменной, без её значения.
 * Пустая строка в необязательной переменной означает значение по умолчанию.
 */
export function readFeatureFlagsConfig(env: NodeJS.ProcessEnv = process.env): FeatureFlagsConfig {
  return {
    url: readUrl(env),
    apiToken: readApiToken(env),
    backupPath: readOptional(env, 'UNLEASH_BACKUP_PATH') ?? tmpdir(),
    refreshIntervalMs: readRefreshInterval(env),
  }
}

function readUrl(env: NodeJS.ProcessEnv): string {
  const value = readRequired(env, 'UNLEASH_URL')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalidUrl()
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalidUrl()
  return value
}

function invalidUrl(): Error {
  return new Error('Переменная UNLEASH_URL должна быть абсолютным адресом http или https')
}

function readApiToken(env: NodeJS.ProcessEnv): string {
  return readRequired(env, 'UNLEASH_API_TOKEN')
}

function readRefreshInterval(env: NodeJS.ProcessEnv): number {
  const value = readOptional(env, 'UNLEASH_REFRESH_INTERVAL_MS')
  if (value === undefined) return DEFAULT_REFRESH_INTERVAL_MS
  const interval = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(interval) || interval <= 0) {
    throw new Error('Переменная UNLEASH_REFRESH_INTERVAL_MS должна быть целым числом больше нуля')
  }
  return interval
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptional(env, name)
  if (value === undefined) throw new Error(`Переменная ${name} не задана`)
  return value
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}
