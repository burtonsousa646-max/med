import { readGatewayConfig } from '@platform/config'
import express from 'express'
import { middleware } from 'express-openapi-validator'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGateway } from '../src/app'

let gateway: Awaited<ReturnType<typeof createGateway>> | undefined
let validatorServer: Server | undefined
let validatorBase: string

describe('K11: HTTP health соответствует operational OpenAPI', () => {
  beforeAll(async () => {
    const config = readGatewayConfig({
      UNLEASH_URL: 'http://127.0.0.1:1/api',
      UNLEASH_API_TOKEN: 'synthetic',
      LOG_LEVEL: 'error',
    })
    gateway = await createGateway({ config, apps: [], testFlags: {} })
    await gateway.app.listen(0, '127.0.0.1')
    const gatewayBase = await gateway.app.getUrl()
    const validator = express()

    // Ответ реального gateway проходит независимую проверку исходного operational-контракта.
    validator.use(
      ...middleware({
        apiSpec: fileURLToPath(
          new URL('../../../../api/operational/gateway-health.yaml', import.meta.url),
        ),
        validateRequests: false,
        validateResponses: true,
        validateSecurity: false,
      }),
    )
    validator.get(['/health/live', '/health/ready'], async (incoming, response, next) => {
      try {
        const result = await fetch(`${gatewayBase}${incoming.originalUrl}`)
        response.setHeader('Cache-Control', result.headers.get('cache-control') ?? '')
        response.status(result.status).json(await result.json())
      } catch (error) {
        next(error)
      }
    })

    validatorServer = await new Promise<Server>((resolve) => {
      const server = validator.listen(0, '127.0.0.1', () => {
        resolve(server)
      })
    })
    const address = validatorServer.address()
    if (!address || typeof address === 'string') throw new Error('Нет адреса валидатора')
    validatorBase = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (validatorServer)
      await new Promise<void>((resolve, reject) => {
        validatorServer!.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    await gateway?.close()
  })

  it('проверяет неготовность и успешную готовность по контракту', async () => {
    const initial = await fetch(`${validatorBase}/health/ready`)
    expect(initial.status).toBe(503)
    expect(await initial.json()).toEqual({
      code: 'not_ready',
      message: 'Сервис не готов принимать запросы',
    })

    gateway!.health.markReady()
    const ready = await fetch(`${validatorBase}/health/ready`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: 'ok' })
  })

  it('проверяет live и ошибку неизвестного параметра по контракту', async () => {
    const live = await fetch(`${validatorBase}/health/live`)
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ status: 'ok' })

    const invalid = await fetch(`${validatorBase}/health/live?unknown=1`)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({
      code: 'invalid_request',
      message: 'Некорректный запрос',
    })
  })
})
