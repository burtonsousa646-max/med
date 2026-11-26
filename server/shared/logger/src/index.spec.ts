// Проверяет, что логгер не раскрывает неизвестные поля и сырые исключения.
import { expect, it } from 'vitest'
import { createPlatformLogger } from './logger.ts'

it('K2: не записывает неизвестные поля и сырые исключения', () => {
  const lines: string[] = []
  const logger = createPlatformLogger(
    { service: 'test', version: '1', env: 'test', level: 'info' },
    {
      write: (line: string) => {
        lines.push(line)
      },
    },
  )
  logger.error(new Error('synthetic-password'))
  logger.event('request', {
    requestId: 'test',
    method: 'POST',
    status: 200,
    durationMs: 1,
    body: 'synthetic-email@example.test',
    cookie: 'synthetic-token',
  })
  expect(lines.join('')).not.toContain('synthetic-')
  expect(lines.join('')).toContain('Запрос завершён')
  expect(lines.join('')).toContain('"service":"test"')
  expect(lines.join('')).toContain('"timestamp":')
})

it('K2: сохраняет обязательные поля и уровень безопасного события', () => {
  const lines: string[] = []
  const logger = createPlatformLogger(
    { service: 'gateway', version: '1.2.3', env: 'test', level: 'info' },
    {
      write: (line: string) => {
        lines.push(line)
      },
    },
  )
  logger.event(
    'request',
    {
      requestId: 'request-1',
      appId: 'cabinet',
      operationId: 'read',
      route: '/v1/items/{id}',
      method: 'GET',
      status: 200,
      durationMs: 12,
    },
    'warn',
  )
  const record: unknown = JSON.parse(lines[0] ?? '')
  expect(record).toMatchObject({
    level: 40,
    service: 'gateway',
    version: '1.2.3',
    env: 'test',
    message: 'Запрос завершён',
    requestId: 'request-1',
    appId: 'cabinet',
    operationId: 'read',
    route: '/v1/items/{id}',
    method: 'GET',
    status: 200,
    durationMs: 12,
  })
  expect(record).toHaveProperty('timestamp', expect.any(String))
})
