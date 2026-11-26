import type { Env } from './config.types.ts'
import { DynamicModule, Module } from '@nestjs/common'
import { isIP } from 'node:net'

export const GATEWAY_CONFIG = Symbol('GatewayConfig')
export const SUGGESTION_CONFIG = Symbol('SuggestionConfig')

/** Сообщает имена неверных настроек, не раскрывая значения переменных окружения. */
export class ConfigurationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(`Неверная конфигурация: ${[...new Set(fields)].join(', ')}`)
  }
}

/** Собирает ошибки проверки окружения и откладывает исключение до завершения чтения. */
class Reader {
  readonly issues: string[] = []
  constructor(readonly env: Env) {}

  /** Читает обязательный текст с необязательным значением по умолчанию. */
  text(name: string, fallback?: string): string {
    const value = this.env[name] ?? fallback ?? ''
    if (!value.trim()) this.issues.push(name)
    return value
  }

  /** Проверяет положительное целое число и верхнюю границу. */
  int(name: string, fallback: number, max = 2_147_483_647): number {
    const raw = this.env[name] ?? String(fallback)
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (!Number.isSafeInteger(value) || value < 1 || value > max) this.issues.push(name)
    return value
  }

  /** Проверяет адрес IPv4 или IPv6. */
  ip(name: string, fallback: string): string {
    const value = this.text(name, fallback)
    if (!isIP(value)) this.issues.push(name)
    return value
  }

  /** Проверяет URL и разрешённые схемы. */
  url(name: string, protocols: readonly string[]): string {
    const value = this.text(name)
    try {
      if (!protocols.includes(new URL(value).protocol)) this.issues.push(name)
    } catch {
      this.issues.push(name)
    }
    return value
  }

  /** Завершает проверку и сообщает все обнаруженные ошибки. */
  check(): void {
    if (this.issues.length) throw new ConfigurationError(this.issues)
  }
}

/** Читает общие настройки процесса и ограничения уровня логирования. */
function common(r: Reader) {
  const env = r.text('NODE_ENV', 'development')
  if (!['development', 'test', 'production'].includes(env)) r.issues.push('NODE_ENV')
  const version = r.text('APP_VERSION', '0.0.0')
  const logLevel = r.text('LOG_LEVEL', 'info')
  if (
    !['debug', 'info', 'warn', 'error'].includes(logLevel) ||
    (env === 'production' && logLevel === 'debug')
  )
    r.issues.push('LOG_LEVEL')
  return { env, version, logLevel, shutdownTimeoutMs: r.int('SHUTDOWN_TIMEOUT_MS', 15000) }
}

/** Проверяет и возвращает неизменяемую конфигурацию Gateway; настройки подсказок включаются опцией. */
export function readGatewayConfig(env: Env, options: { suggestions?: boolean } = {}) {
  const r = new Reader(env)
  const base = common(r)
  const http = Object.freeze({
    host: r.ip('HTTP_HOST', '0.0.0.0'),
    port: r.int('HTTP_PORT', 3000, 65535),
    requestTimeoutMs: r.int('HTTP_REQUEST_TIMEOUT_MS', 10000),
    bodyLimitBytes: r.int('HTTP_BODY_LIMIT_BYTES', 1048576),
  })
  const grpc = Object.freeze({
    healthHost: r.ip('GRPC_HEALTH_HOST', '127.0.0.1'),
    healthPort: r.int('GRPC_HEALTH_PORT', 50050, 65535),
    callTimeoutMs: r.int('GRPC_CALL_TIMEOUT_MS', 3000, http.requestTimeoutMs),
  })
  if (
    http.port === grpc.healthPort &&
    (http.host === grpc.healthHost ||
      ['0.0.0.0', '::'].includes(http.host) ||
      ['0.0.0.0', '::'].includes(grpc.healthHost))
  )
    r.issues.push('HTTP_PORT', 'GRPC_HEALTH_PORT')

  // Полная проверка настроек Unleash остаётся в существующем пакете флагов.
  r.url('UNLEASH_URL', ['http:', 'https:'])
  r.text('UNLEASH_API_TOKEN')
  const suggestions = options.suggestions
    ? readGatewaySuggestions(r, base.env, http.requestTimeoutMs)
    : undefined
  r.check()
  return Object.freeze({ ...base, http, grpc, suggestions })
}

/** Регистрирует проверенную конфигурацию как глобальную зависимость NestJS. */
@Module({})
export class ConfigModule {
  /** Регистрирует зависимости модуля с переданными настройками. */
  static forRoot(options: { config: unknown; token?: symbol }): DynamicModule {
    const token = options.token ?? GATEWAY_CONFIG
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: token, useValue: options.config }],
      exports: [token],
    }
  }
}

/** Проверяет минимальную длину секрета в байтах UTF-8. */
function secret(r: Reader, name: string): string {
  const value = r.text(name)
  if (Buffer.byteLength(value, 'utf8') < 32) r.issues.push(name)
  return value
}

/** Проверяет область разделения ключей Redis для окружения. */
function scope(r: Reader, environment: string): string {
  const value = r.text('SUGGESTION_SCOPE', environment === 'production' ? undefined : 'local')
  if (!/^[a-z0-9-]{1,32}$/.test(value)) r.issues.push('SUGGESTION_SCOPE')
  return value
}

/** Читает настройки gRPC, лимитера и доверенных прокси Gateway. */
function readGatewaySuggestions(r: Reader, environment: string, requestBudget: number) {
  const target = r.text('SUGGESTION_GRPC_TARGET')
  if (
    !/^(?:\[[0-9a-f:]+\]|[a-zA-Z0-9.-]+):[0-9]+$/.test(target) ||
    Number(target.slice(target.lastIndexOf(':') + 1)) < 1 ||
    Number(target.slice(target.lastIndexOf(':') + 1)) > 65535
  )
    r.issues.push('SUGGESTION_GRPC_TARGET')
  const trustedProxies = (r.env['GATEWAY_TRUSTED_PROXY_CIDRS'] ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  for (const cidr of trustedProxies) {
    const [ip, prefix, extra] = cidr.split('/')
    const family = isIP(ip ?? '')
    const bits = Number(prefix)
    if (
      extra !== undefined ||
      !family ||
      !prefix ||
      !/^\d+$/.test(prefix) ||
      !Number.isInteger(bits) ||
      bits < 1 ||
      bits > (family === 4 ? 32 : 128)
    )
      r.issues.push('GATEWAY_TRUSTED_PROXY_CIDRS')
  }
  return Object.freeze({
    target,
    scope: scope(r, environment),
    rateRedisUrl: r.url('SUGGESTION_RATE_REDIS_URL', ['redis:', 'rediss:']),
    hmacSecret: secret(r, 'SUGGESTION_RATE_HMAC_SECRET'),
    rps: r.int('SUGGESTION_RATE_LIMIT_RPS', 5, 1000),
    redisTimeoutMs: r.int('SUGGESTION_REDIS_TIMEOUT_MS', 100, Math.min(1000, requestBudget - 1)),
    trustedProxies: Object.freeze(trustedProxies),
  })
}

/** Проверяет настройки сервиса подсказок, источника и кеша до запуска. */
export function readSuggestionConfig(env: Env) {
  const r = new Reader(env)
  const base = common(r)
  const provider = r.text('SUGGESTION_PROVIDER')
  if (
    !['dadata-cloud', 'dadata-onprem-stub', 'stub'].includes(provider) ||
    (base.env === 'production' && provider !== 'dadata-cloud')
  )
    r.issues.push('SUGGESTION_PROVIDER')
  let cloudUrl: string | undefined
  let cloudApiKey: string | undefined
  if (provider === 'dadata-cloud') {
    cloudUrl = r.url('DADATA_CLOUD_URL', ['https:'])
    cloudApiKey = r.text('DADATA_CLOUD_API_KEY')
    if (/[\r\n]/.test(cloudApiKey)) r.issues.push('DADATA_CLOUD_API_KEY')
    try {
      const url = new URL(cloudUrl)
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith('/suggest/')
      )
        r.issues.push('DADATA_CLOUD_URL')
    } catch {
      r.issues.push('DADATA_CLOUD_URL')
    }
  }
  const http = Object.freeze({
    host: r.ip('HTTP_HOST', '0.0.0.0'),
    port: r.int('HTTP_PORT', 3001, 65535),
  })
  const grpc = Object.freeze({
    host: r.ip('GRPC_HOST', '127.0.0.1'),
    port: r.int('GRPC_PORT', 50051, 65535),
  })
  if (
    http.port === grpc.port &&
    (http.host === grpc.host ||
      ['0.0.0.0', '::'].includes(http.host) ||
      ['0.0.0.0', '::'].includes(grpc.host))
  )
    r.issues.push('HTTP_PORT', 'GRPC_PORT')
  const config = {
    ...base,
    provider: provider as 'dadata-cloud' | 'dadata-onprem-stub' | 'stub',
    cloudUrl,
    cloudApiKey,
    http,
    grpc,
    scope: scope(r, base.env),
    timeoutMs: r.int('SUGGESTION_TIMEOUT_MS', 1500, 3000),
    cacheTtlSec: r.int('SUGGESTION_CACHE_TTL_SEC', 86400, 86400),
    cacheRedisUrl: r.url('SUGGESTION_CACHE_REDIS_URL', ['redis:', 'rediss:']),
    cacheHmacSecret: secret(r, 'SUGGESTION_CACHE_HMAC_SECRET'),
    redisTimeoutMs: r.int('SUGGESTION_REDIS_TIMEOUT_MS', 100, 1000),
  }
  r.check()
  return Object.freeze(config)
}

/** Читает настройки внутреннего gRPC Notifications; в ошибках указываются только имена переменных. */
export function readNotificationsConfig(env: Env) {
  const r = new Reader(env)
  const base = common(r)
  const host = r.ip('GRPC_HOST', '0.0.0.0')
  const port = r.int('GRPC_PORT', 50057, 65535)
  const timeoutMs = r.int('NOTIFICATIONS_CHANNEL_TIMEOUT_MS', 3000)
  const resultReserveMs = r.int('NOTIFICATIONS_RESULT_RESERVE_MS', 150)
  const databaseUrl = r.url('NOTIFICATIONS_DATABASE_URL', ['postgresql:', 'postgres:'])
  const current = r.text('NOTIFICATIONS_HMAC_CURRENT')
  function entries(name: string) {
    try {
      const data: unknown = JSON.parse(r.text(name))
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
      const pairs = Object.entries(data)
      if (
        !pairs.length ||
        pairs.some(([key, v]) => !key.trim() || typeof v !== 'string' || !v.trim())
      )
        throw new Error()
      return pairs as [string, string][]
    } catch {
      r.issues.push(name)
      return []
    }
  }
  const versions = new Map(
    entries('NOTIFICATIONS_HMAC_KEYS').map(([key, hex]) => {
      if (!/^(?:[a-f0-9]{2}){32,}$/i.test(hex)) r.issues.push('NOTIFICATIONS_HMAC_KEYS')
      return [key, Buffer.from(hex, 'hex')] as const
    }),
  )
  if (!versions.has(current)) r.issues.push('NOTIFICATIONS_HMAC_CURRENT')
  const clients = new Map(
    entries('NOTIFICATIONS_CLIENT_CERTIFICATES').map(([hash, identity]) => {
      if (!/^[a-f0-9]{64}$/i.test(hash)) r.issues.push('NOTIFICATIONS_CLIENT_CERTIFICATES')
      return [hash.toLowerCase(), identity] as const
    }),
  )
  const tls = {
    ca: r.text('NOTIFICATIONS_TLS_CA_FILE'),
    cert: r.text('NOTIFICATIONS_TLS_CERT_FILE'),
    key: r.text('NOTIFICATIONS_TLS_KEY_FILE'),
  }
  const smtp = readNotificationsSmtp(r)
  const postbox = readNotificationsPostbox(r)
  const postboxStream = readNotificationsPostboxStream(r)
  const telegram = readNotificationsTelegram(r)
  r.check()
  return {
    ...base,
    host,
    port,
    timeoutMs,
    resultReserveMs,
    databaseUrl,
    keys: { current, versions },
    clients,
    tls,
    smtp,
    postbox,
    postboxStream,
    telegram,
  }
}

/** Параметры отдельного потока подтверждений и его учётной записи только для чтения. */
function readNotificationsPostboxStream(r: Reader) {
  if (
    !Object.entries(r.env).some(
      ([name, value]) => name.startsWith('NOTIFICATIONS_POSTBOX_STREAM_') && value?.trim(),
    )
  )
    return undefined

  const endpointKey = 'NOTIFICATIONS_POSTBOX_STREAM_ENDPOINT'
  const endpoint = r.text(endpointKey).trim()
  try {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      r.issues.push(endpointKey)
    }
  } catch {
    r.issues.push(endpointKey)
  }
  const name = r.text('NOTIFICATIONS_POSTBOX_STREAM_NAME').trim()
  const region = r.text('NOTIFICATIONS_POSTBOX_STREAM_REGION').trim()
  const identityId = r.text('NOTIFICATIONS_POSTBOX_STREAM_IDENTITY_ID').trim()
  const accessKeyId = r.text('NOTIFICATIONS_POSTBOX_STREAM_ACCESS_KEY_ID').trim()
  if (!/^\/[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/iu.test(name)) {
    r.issues.push('NOTIFICATIONS_POSTBOX_STREAM_NAME')
  }
  if (!/^[a-z0-9-]+$/u.test(region)) r.issues.push('NOTIFICATIONS_POSTBOX_STREAM_REGION')
  if (!/^[a-z0-9_-]+$/iu.test(identityId)) r.issues.push('NOTIFICATIONS_POSTBOX_STREAM_IDENTITY_ID')
  if (!/^[a-z0-9]+$/iu.test(accessKeyId))
    r.issues.push('NOTIFICATIONS_POSTBOX_STREAM_ACCESS_KEY_ID')
  return {
    endpoint,
    name,
    region,
    identityId,
    accessKeyId,
    secretAccessKey: r.text('NOTIFICATIONS_POSTBOX_STREAM_SECRET_ACCESS_KEY'),
  }
}

/** Включает Telegram при наличии настроек выделенной пользовательской сессии. */
function readNotificationsTelegram(r: Reader) {
  if (
    !Object.entries(r.env).some(
      ([name, value]) => name.startsWith('NOTIFICATIONS_TELEGRAM_') && value?.trim(),
    )
  ) {
    return undefined
  }
  const accountId = r.text('NOTIFICATIONS_TELEGRAM_ACCOUNT_ID').trim()
  if (!/^[1-9]\d{0,18}$/u.test(accountId) || BigInt(accountId) > 9_223_372_036_854_775_807n) {
    r.issues.push('NOTIFICATIONS_TELEGRAM_ACCOUNT_ID')
  }
  const apiHash = r.text('NOTIFICATIONS_TELEGRAM_API_HASH').trim()
  if (!/^[a-f0-9]{32}$/iu.test(apiHash)) r.issues.push('NOTIFICATIONS_TELEGRAM_API_HASH')
  return {
    accountId,
    apiId: r.int('NOTIFICATIONS_TELEGRAM_API_ID', 0),
    apiHash,
    session: r.text('NOTIFICATIONS_TELEGRAM_SESSION').trim(),
  }
}

/** Читает адрес и учётные данные Postbox только для настроенного адаптера. */
function readNotificationsPostbox(r: Reader) {
  if (
    !Object.entries(r.env).some(
      ([name, value]) => name.startsWith('NOTIFICATIONS_POSTBOX_') && value?.trim(),
    )
  )
    return undefined

  const name = 'NOTIFICATIONS_POSTBOX_ENDPOINT'
  const endpoint = r.text(name).trim()
  try {
    const url = new URL(endpoint)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      r.issues.push(name)
    }
  } catch {
    r.issues.push(name)
  }

  return {
    endpoint,
    id: r.text('NOTIFICATIONS_POSTBOX_SENDER_CONFIG'),
    from: r.text('NOTIFICATIONS_POSTBOX_FROM'),
    subject: r.text('NOTIFICATIONS_POSTBOX_SUBJECT'),
    configurationSet: r.text('NOTIFICATIONS_POSTBOX_CONFIGURATION_SET'),
    iamToken: r.text('NOTIFICATIONS_POSTBOX_IAM_TOKEN'),
  }
}

/** Читает настройки SMTP, если окружение подключает почтовый сервер. */
function readNotificationsSmtp(r: Reader) {
  if (
    !Object.entries(r.env).some(
      ([name, value]) => name.startsWith('NOTIFICATIONS_SMTP_') && value?.trim(),
    )
  )
    return undefined

  const host = r.text('NOTIFICATIONS_SMTP_HOST').trim()
  const senderConfig = r.text('NOTIFICATIONS_SMTP_SENDER_CONFIG').trim()
  const from = r.text('NOTIFICATIONS_SMTP_FROM').trim()
  const subject = r.text('NOTIFICATIONS_SMTP_SUBJECT')
  const username = r.text('NOTIFICATIONS_SMTP_USERNAME')
  const password = r.text('NOTIFICATIONS_SMTP_PASSWORD')
  const tlsMode = r.text('NOTIFICATIONS_SMTP_TLS_MODE', 'starttls')
  if (!isIP(host) && !/^[a-z0-9][a-z0-9.-]*$/i.test(host)) r.issues.push('NOTIFICATIONS_SMTP_HOST')
  if (!/^[a-z0-9_-]{1,64}$/i.test(senderConfig)) r.issues.push('NOTIFICATIONS_SMTP_SENDER_CONFIG')
  if (
    from.length > 254 ||
    !/^[^\s@<>,"\\\p{Cc}]+@[^\s@<>,"\\\p{Cc}]+\.[^\s@<>,"\\\p{Cc}]+$/u.test(from)
  )
    r.issues.push('NOTIFICATIONS_SMTP_FROM')
  if (/[\r\n]/u.test(subject)) r.issues.push('NOTIFICATIONS_SMTP_SUBJECT')
  if (username.includes('\0')) r.issues.push('NOTIFICATIONS_SMTP_USERNAME')
  if (password.includes('\0')) r.issues.push('NOTIFICATIONS_SMTP_PASSWORD')
  if (tlsMode !== 'starttls' && tlsMode !== 'implicit') r.issues.push('NOTIFICATIONS_SMTP_TLS_MODE')
  return {
    host,
    port: r.int('NOTIFICATIONS_SMTP_PORT', tlsMode === 'implicit' ? 465 : 587, 65535),
    implicitTls: tlsMode === 'implicit',
    caFile: r.env['NOTIFICATIONS_SMTP_CA_FILE']?.trim() || undefined,
    senderConfig,
    from,
    subject,
    username,
    password,
  }
}
