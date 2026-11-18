import { Controller, Get } from '@nestjs/common'
import { readGatewayConfig } from '@platform/config'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { createGateway } from '../src/app'
import { OpenApiRegistry } from '../src/openapi'

/** Содержит пересекающиеся маршруты с параметрическим методом первым. */
@Controller('/api/test')
class ParameterFirstController {
  /** Возвращает маркер параметрического маршрута. */
  @Get('/v1/:first/fixed')
  parameter() {
    return { selected: 'parameter' }
  }

  /** Возвращает маркер статического маршрута. */
  @Get('/v1/static/:last')
  literal() {
    return { selected: 'static' }
  }
}

/** Содержит те же маршруты в обратном порядке объявления. */
@Controller('/api/test')
class LiteralFirstController {
  /** Возвращает маркер статического маршрута. */
  @Get('/v1/static/:last')
  literal() {
    return { selected: 'static' }
  }

  /** Возвращает маркер параметрического маршрута. */
  @Get('/v1/:first/fixed')
  parameter() {
    return { selected: 'parameter' }
  }
}

/** Предоставляет параметрический маршрут в отдельном контроллере. */
@Controller('/api/test')
class ParameterController {
  /** Возвращает маркер параметрического маршрута. */
  @Get('/v1/:first/fixed')
  parameter() {
    return { selected: 'parameter' }
  }
}

/** Предоставляет статический маршрут в отдельном контроллере. */
@Controller('/api/test')
class LiteralController {
  /** Возвращает маркер статического маршрута. */
  @Get('/v1/static/:last')
  literal() {
    return { selected: 'static' }
  }
}

/** Содержит два одинаковых шаблона с разными именами параметров. */
@Controller('/api/test')
class ConflictingController {
  /** Обрабатывает первый шаблон. */
  @Get('/v1/:first')
  first() {
    return {}
  }

  /** Обрабатывает второй шаблон. */
  @Get('/v1/:second')
  second() {
    return {}
  }
}

/** Имитирует контроллер без регистрации в контракте. */
@Controller('/api/test')
class UnregisteredController {
  /** Обрабатывает отсутствующий в реестре маршрут. */
  @Get('/v1/unregistered')
  missing() {
    return {}
  }
}

describe('K4: приоритет пересекающихся маршрутов', () => {
  it('отклоняет контроллер, маршрут которого отсутствует в реестре', () => {
    const registry = new OpenApiRegistry([])

    expect(() => {
      registry.assertControllers([UnregisteredController], [])
    }).toThrow('Незарегистрированный контроллер')
  })

  it('отклоняет одинаковые шаблоны с разными именами параметров', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'gateway-conflict-'))

    try {
      const documentFile = join(folder, 'test.json')
      await writeFile(
        documentFile,
        JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'test', version: '1' },
          servers: [{ url: '/api/test' }],
          paths: {
            '/v1/{first}': { get: { operationId: 'first' } },
            '/v1/{second}': { get: { operationId: 'second' } },
          },
        }),
      )

      expect(
        () =>
          new OpenApiRegistry([
            {
              id: 'test',
              documentFile,
              operations: [
                {
                  operationId: 'first',
                  method: 'GET',
                  path: '/v1/{first}',
                  controller: ConflictingController,
                  handler: 'first',
                },
                {
                  operationId: 'second',
                  method: 'GET',
                  path: '/v1/{second}',
                  controller: ConflictingController,
                  handler: 'second',
                },
              ],
            },
          ]),
      ).toThrow('Неоднозначный маршрут')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it.each([
    ['параметрический метод первый', ParameterFirstController, ParameterFirstController, false],
    ['статический метод первый', LiteralFirstController, LiteralFirstController, true],
    ['параметрический контроллер первый', ParameterController, LiteralController, false],
    ['статический контроллер первый', ParameterController, LiteralController, true],
  ])('%s', async (_name, parameterController, literalController, literalFirst) => {
    const folder = await mkdtemp(join(tmpdir(), 'gateway-routes-'))
    let gateway: Awaited<ReturnType<typeof createGateway>> | undefined

    try {
      const documentFile = join(folder, 'test.json')
      const parameterPath = '/v1/{first}/fixed'
      const literalPath = '/v1/static/{last}'
      const parameter = {
        operationId: 'parameter',
        parameters: [{ in: 'path', name: 'first', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'ok' } },
      }
      const literal = {
        operationId: 'literal',
        security: [],
        parameters: [
          { in: 'path', name: 'last', required: true, schema: { type: 'string' } },
          {
            in: 'query',
            name: 'mode',
            required: true,
            schema: { type: 'string', enum: ['static'] },
          },
        ],
        responses: { 200: { description: 'ok' } },
      }
      const paths = literalFirst
        ? { [literalPath]: { get: literal }, [parameterPath]: { get: parameter } }
        : { [parameterPath]: { get: parameter }, [literalPath]: { get: literal } }

      await writeFile(
        documentFile,
        JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'test', version: '1' },
          servers: [{ url: '/api/test' }],
          paths,
        }),
      )

      const parameterBinding = {
        operationId: 'parameter',
        method: 'GET',
        path: parameterPath,
        controller: parameterController,
        handler: 'parameter',
      }
      const literalBinding = {
        operationId: 'literal',
        method: 'GET',
        path: literalPath,
        controller: literalController,
        handler: 'literal',
      }
      const operations = literalFirst
        ? [literalBinding, parameterBinding]
        : [parameterBinding, literalBinding]
      const apps = [{ id: 'test', documentFile, operations }]
      const registry = new OpenApiRegistry(apps)

      expect(registry.resolve('GET', '/api/test/v1/static/fixed')?.operation.operationId).toBe(
        'literal',
      )
      expect(registry.resolve('GET', '/api/test/v1/static%2Ffixed')).toBeUndefined()

      const config = readGatewayConfig({
        UNLEASH_URL: 'http://127.0.0.1:1/api',
        UNLEASH_API_TOKEN: 'synthetic',
        LOG_LEVEL: 'error',
      })
      gateway = await createGateway({ config, testFlags: {}, apps })
      await gateway.app.listen(0, '127.0.0.1')
      gateway.health.markReady()

      const base = await gateway.app.getUrl()
      const valid = await fetch(`${base}/api/test/v1/static/fixed?mode=static`)
      expect(valid.status).toBe(200)
      expect(await valid.json()).toEqual({ selected: 'static' })
      expect((await fetch(`${base}/api/test/v1/static/fixed?mode=wrong`)).status).toBe(400)
      expect((await fetch(`${base}/api/test/v1/other/fixed`)).status).toBe(401)
      expect((await fetch(`${base}/api/test/v1/static%2Ffixed`)).status).toBe(404)
    } finally {
      await gateway?.close()
      await rm(folder, { recursive: true, force: true })
    }
  })
})
