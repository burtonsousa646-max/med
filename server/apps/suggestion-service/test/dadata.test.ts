import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { DadataHttpClient } from '../src/infrastructure/dadata'
import { SourceUnavailableError } from '../src/domain/suggestion'

// Локальный HTTP-сервер имитирует внешнюю DaData, не требуя сети и реального ключа.
let server: Server | undefined
let url: string
let responseStatus = 200
let responseBody = '{"suggestions":[]}'
let hang = false
let calls = 0
let received: { authorization?: string; body?: unknown; path?: string } = {}

/** Поднимает управляемый HTTP-ответчик на случайном loopback-порту. */
beforeAll(async () => {
  server = createServer((req, res) => {
    calls++
    const chunks: Buffer[] = []
    req.on('data', (part: Buffer) => chunks.push(part))
    req.on('end', () => {
      received = {
        authorization: req.headers.authorization,
        path: req.url,
        body: JSON.parse(Buffer.concat(chunks).toString()) as unknown,
      }
      if (hang) return
      res.writeHead(responseStatus, { 'Content-Type': 'application/json' })
      res.end(responseBody)
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/suggest/`
})

/** Закрывает открытые соединения и сервер после набора транспортных проверок. */
afterAll(async () => {
  server?.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => {
      if (error) reject(error)
      else resolve()
    }),
  )
})

// Проверяем HTTP-метод, путь, количество результатов и передачу ключа авторизации.
it('R7.1: отправляет POST и фиксированный count, сохраняет ключ на сервере', async () => {
  const client = new DadataHttpClient(url, 'synthetic-key', 1000)
  expect(
    await client.post('party', { query: 'пример', count: 10 }, new AbortController().signal),
  ).toEqual({ suggestions: [] })
  expect(received).toEqual({
    authorization: 'Token synthetic-key',
    path: '/suggest/party',
    body: { query: 'пример', count: 10 },
  })
})

// Статусная ошибка не должна приводить к автоматической повторной оплате квоты.
it.each([403, 429, 500])('R9.1/R9.4: статус %s — недоступность без повторов', async (status) => {
  responseStatus = status
  const before = calls
  await expect(
    new DadataHttpClient(url, 'synthetic-key', 1000).post(
      'party',
      { query: 'пример', count: 10 },
      new AbortController().signal,
    ),
  ).rejects.toThrow(SourceUnavailableError)
  expect(calls - before).toBe(1)
  responseStatus = 200
})

// Ошибочный JSON и превышение лимита тела должны классифицироваться как отказ источника.
it('R9.1: неверный JSON и большой ответ не становятся пустым поиском', async () => {
  responseBody = 'invalid'
  await expect(
    new DadataHttpClient(url, 'synthetic-key', 1000).post(
      'party',
      { query: 'пример', count: 10 },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ reason: 'protocol' })
  responseBody = 'x'.repeat(2097153)
  await expect(
    new DadataHttpClient(url, 'synthetic-key', 1000).post(
      'party',
      { query: 'пример', count: 10 },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ reason: 'response_limit' })
  responseBody = '{"suggestions":[]}'
})

// Зависшее чтение ограничивается таймаутом, даже если сервер не прислал тело.
it('R9.1: таймаут отменяет чтение источника', async () => {
  hang = true
  await expect(
    new DadataHttpClient(url, 'synthetic-key', 50).post(
      'party',
      { query: 'пример', count: 10 },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ reason: 'timeout' })
  hang = false
})
