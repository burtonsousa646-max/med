// Проверяет значения по умолчанию, границы настроек и защиту секретов в ошибках.
import { describe, expect, it } from 'vitest'
import {
  ConfigurationError,
  readGatewayConfig,
  readNotificationsConfig,
  readSuggestionConfig,
} from './config.ts'

const valid = {
  UNLEASH_URL: 'http://127.0.0.1:4242/api',
  UNLEASH_API_TOKEN: 'synthetic-test-token',
}

describe('Адрес Postbox в конфигурации нотификаций', () => {
  const notifications = {
    NOTIFICATIONS_DATABASE_URL: 'postgresql://localhost/notifications_test',
    NOTIFICATIONS_TLS_CA_FILE: 'ca.pem',
    NOTIFICATIONS_TLS_CERT_FILE: 'server.pem',
    NOTIFICATIONS_TLS_KEY_FILE: 'server.key',
    NOTIFICATIONS_HMAC_CURRENT: 'v1',
    NOTIFICATIONS_HMAC_KEYS: JSON.stringify({ v1: 'ff'.repeat(32) }),
    NOTIFICATIONS_CLIENT_CERTIFICATES: JSON.stringify({ ['ff'.repeat(32)]: 'test-service' }),
  }
  const postbox = {
    NOTIFICATIONS_POSTBOX_SENDER_CONFIG: 'test',
    NOTIFICATIONS_POSTBOX_FROM: 'sender@example.test',
    NOTIFICATIONS_POSTBOX_SUBJECT: 'Тест',
    NOTIFICATIONS_POSTBOX_CONFIGURATION_SET: 'test',
    NOTIFICATIONS_POSTBOX_IAM_TOKEN: 'synthetic-token',
  }

  it('использует адрес из окружения и оставляет адаптер выключенным без настроек', () => {
    expect(readNotificationsConfig(notifications).postbox).toBeUndefined()
    const endpoint = 'https://postbox.example.test:8443'
    expect(
      readNotificationsConfig({
        ...notifications,
        ...postbox,
        NOTIFICATIONS_POSTBOX_ENDPOINT: endpoint,
      }).postbox?.endpoint,
    ).toBe(endpoint)
  })

  it.each([
    '',
    'http://postbox.example.test',
    'https://user:synthetic-secret@postbox.example.test',
    'https://postbox.example.test/other',
  ])('отклоняет некорректный адрес без раскрытия его значения', (endpoint) => {
    const read = () =>
      readNotificationsConfig({
        ...notifications,
        ...postbox,
        NOTIFICATIONS_POSTBOX_ENDPOINT: endpoint,
      })
    expect(read).toThrow('NOTIFICATIONS_POSTBOX_ENDPOINT')
    expect(read).not.toThrow('synthetic-secret')
  })
})

describe('конфигурация gateway — K1', () => {
  it('проверяет значения по умолчанию и запрещает изменение результата', () => {
    const config = readGatewayConfig(valid)
    expect(config.http.port).toBe(3000)
    expect(Object.isFrozen(config.http)).toBe(true)
    expect(Object.isFrozen(config)).toBe(true)
  })
  it.each([
    ['HTTP_PORT', '0'],
    ['HTTP_PORT', '65536'],
    ['HTTP_PORT', '1.5'],
    ['HTTP_HOST', 'localhost'],
    ['GRPC_HEALTH_PORT', '-1'],
    ['GRPC_CALL_TIMEOUT_MS', '10001'],
    ['HTTP_REQUEST_TIMEOUT_MS', '0'],
    ['HTTP_BODY_LIMIT_BYTES', '0'],
    ['SHUTDOWN_TIMEOUT_MS', '0'],
    ['LOG_LEVEL', 'trace'],
    ['NODE_ENV', 'secret-value'],
    ['APP_VERSION', ''],
    ['UNLEASH_URL', 'synthetic-secret'],
    ['UNLEASH_API_TOKEN', ''],
  ])('отклоняет неверную переменную %s без раскрытия значения', (key, value) => {
    expect(() => readGatewayConfig({ ...valid, [key]: value })).toThrow(ConfigurationError)
    expect(() => readGatewayConfig({ ...valid, [key]: value })).toThrow(key)
  })
  it('отклоняет debug в production и пересечение портов', () => {
    expect(() =>
      readGatewayConfig({ ...valid, NODE_ENV: 'production', LOG_LEVEL: 'debug' }),
    ).toThrow('LOG_LEVEL')
    expect(() => readGatewayConfig({ ...valid, HTTP_PORT: '50050' })).toThrow('HTTP_PORT')
  })
  it('не раскрывает секрет неверной конфигурации', () => {
    expect(() => readGatewayConfig({ ...valid, UNLEASH_URL: 'synthetic-password' })).not.toThrow(
      'synthetic-password',
    )
  })
})

const suggestionEnv = {
  NODE_ENV: 'test',
  SUGGESTION_PROVIDER: 'stub',
  SUGGESTION_CACHE_REDIS_URL: 'redis://127.0.0.1:6381',
  SUGGESTION_CACHE_HMAC_SECRET: 'synthetic-cache-secret-at-least-32-characters',
}
it('R7.3: stub не требует cloud-ключей; production их не подменяет', () => {
  expect(readSuggestionConfig(suggestionEnv).provider).toBe('stub')
  expect(() => readSuggestionConfig({ ...suggestionEnv, NODE_ENV: 'production' })).toThrow()
  expect(() =>
    readSuggestionConfig({ ...suggestionEnv, SUGGESTION_PROVIDER: 'dadata-cloud' }),
  ).toThrow('DADATA_CLOUD_API_KEY')
})
it.each([
  ['SUGGESTION_CACHE_TTL_SEC', '86401'],
  ['SUGGESTION_TIMEOUT_MS', '0'],
  ['SUGGESTION_CACHE_HMAC_SECRET', 'short'],
  ['HTTP_PORT', '50051'],
  ['SUGGESTION_PROVIDER', 'wrong'],
])('отклоняет неверную настройку сервиса %s', (key, value) => {
  expect(() => readSuggestionConfig({ ...suggestionEnv, [key]: value })).toThrow(key)
})
it('R8.5: читает изменяемый RPS и запрещает wildcard-прокси', () => {
  const env = {
    ...valid,
    SUGGESTION_GRPC_TARGET: '127.0.0.1:50051',
    SUGGESTION_RATE_REDIS_URL: 'redis://127.0.0.1:6380',
    SUGGESTION_RATE_HMAC_SECRET: 'synthetic-rate-secret-at-least-32-characters',
  }
  expect(readGatewayConfig(env, { suggestions: true }).suggestions?.rps).toBe(5)
  expect(
    readGatewayConfig({ ...env, SUGGESTION_RATE_LIMIT_RPS: '2' }, { suggestions: true }).suggestions
      ?.rps,
  ).toBe(2)
  expect(() =>
    readGatewayConfig({ ...env, GATEWAY_TRUSTED_PROXY_CIDRS: '0.0.0.0/0' }, { suggestions: true }),
  ).toThrow('GATEWAY_TRUSTED_PROXY_CIDRS')
})
