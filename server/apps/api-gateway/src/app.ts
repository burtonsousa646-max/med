import { Module, Type } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService, NestFactory } from '@nestjs/core'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express'
import { ConfigModule } from '@platform/config'
import { PROTO_LOADER_OPTIONS, protoPath } from '@platform/contracts'
import { FeatureFlagsModule } from '@platform/feature-flags'
import { GrpcHealthController, HealthController, HealthModule, HealthState } from '@platform/health'
import { PlatformLogger, PlatformLoggerModule, createPlatformLogger } from '@platform/logger'
import express, { ErrorRequestHandler, NextFunction, Request, Response, Router } from 'express'
import { middleware } from 'express-openapi-validator'
import { OpenApiSpecLoader } from 'express-openapi-validator/dist/framework/openapi.spec.loader.js'
import type { OpenAPIFrameworkArgs } from 'express-openapi-validator/dist/framework/types.js'
import type { OpenApiValidatorOpts } from 'express-openapi-validator/dist/openapi.validator.js'
import 'reflect-metadata'
import type { GatewayOptions } from './app.types.ts'
import { RequestContexts } from './context.ts'
import { GatewayError, PublicOnlyAccessPolicy, SafeExceptionFilter, sendError } from './errors.ts'
import { FeatureFlagsService } from './feature-flags.ts'
import { RequestScope } from './grpc'
import { ShutdownCoordinator } from './lifecycle'
import { APP_REGISTRY, OpenApiRegistry } from './openapi'

/** Создаёт HTTP и gRPC инфраструктуру Gateway с заданным реестром приложений. */
export async function createGateway(options: GatewayOptions) {
  const { config } = options
  const definitions = options.apps ?? APP_REGISTRY
  const registry = new OpenApiRegistry(definitions)
  if (
    definitions.some((app) => app.operations.some((operation) => operation.rateLimit)) &&
    !options.beforeRequest
  )
    throw new Error('Ограничитель обязателен для подсказок')
  const validators = new Map<string, Router>()
  for (const definition of definitions) {
    // Имена параметров в express не допускают дефис; внешний URL при этом не меняется.
    const document = structuredClone(registry.getDocument(definition.id))
    const flagPath = document.paths['/v1/feature-flags/{web-app}']
    if (flagPath) {
      delete document.paths['/v1/feature-flags/{web-app}']
      document.paths['/v1/feature-flags/{web_app}'] = flagPath
      const operation = flagPath['get']
      if (Array.isArray(operation?.['parameters'])) {
        for (const parameter of operation['parameters'] as { name?: string }[]) {
          if (parameter.name === 'web-app') parameter.name = 'web_app'
        }
      }
    }
    const settings: OpenApiValidatorOpts = {
      apiSpec: document as unknown as Exclude<OpenApiValidatorOpts['apiSpec'], string>,
      validateApiSpec: true,
      validateRequests: {
        allowUnknownQueryParameters: false,
        removeAdditional: false,
        coerceTypes: false,
        allErrors: false,
      },
      validateSecurity: false,
      validateResponses: options.validateResponses ?? false,
      operationHandlers: false,
      fileUploader: false,
      ignoreUndocumented: false,
    }
    await new OpenApiSpecLoader({
      apiDoc: settings.apiSpec as OpenAPIFrameworkArgs['apiDoc'],
      validateApiSpec: true,
    }).load()
    const router = Router()
    router.use(...middleware(settings))
    validators.set(definition.id, router)
  }
  const loggerOptions = {
    service: 'api-gateway',
    version: config.version,
    env: config.env,
    level: config.logLevel,
  }
  const contexts = new RequestContexts()
  const controllers = [
    ...new Set(definitions.flatMap((d) => d.operations.map((o) => o.controller))),
    ...(options.extraControllers ?? []),
  ]
  registry.assertControllers(controllers, [])
  @Module({
    imports: [
      DiscoveryModule,
      ConfigModule.forRoot({ config }),
      PlatformLoggerModule.forRoot(loggerOptions),
      HealthModule.register({ serviceName: 'api-gateway' }),
      options.testFlags === undefined
        ? FeatureFlagsModule.forRoot({ appName: 'api-gateway' })
        : FeatureFlagsModule.forTesting(options.testFlags),
    ],
    controllers,
    providers: [
      { provide: OpenApiRegistry, useValue: registry },
      { provide: RequestContexts, useValue: contexts },
      FeatureFlagsService,
      ...(options.providers ?? []),
    ],
  })
  /** Внутренний модуль NestJS с контроллерами и зависимостями выбранных приложений. */
  class GatewayModule {}
  const http = express()
  http.set('case sensitive routing', true)
  http.set('strict routing', true)
  http.set('trust proxy', false)
  const adapter = new ExpressAdapter(http)
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule, adapter, {
    bodyParser: false,
    logger: createPlatformLogger(loggerOptions),
    abortOnError: false,
    routeResolutionStrategy: 'specificity',
  })
  const logger = app.get(PlatformLogger)
  app.useLogger(logger)
  app.useGlobalFilters(new SafeExceptionFilter())
  const health = app.get(HealthState)
  const shutdown = new ShutdownCoordinator(health, config.shutdownTimeoutMs, async () => {
    await options.close?.()
    await app.close()
  })
  const access = new PublicOnlyAccessPolicy()
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'GET' && ['/health/live', '/health/ready'].includes(req.path)) {
      next()
      return
    }
    const scope = new RequestScope(config.http.requestTimeoutMs)
    res.setHeader('X-Request-Id', scope.requestId)
    const route = registry.resolve(req.method, req.path)
    if (!route) {
      res.once('finish', () => {
        logger.event('request', {
          requestId: scope.requestId,
          method: req.method,
          status: res.statusCode,
          durationMs: performance.now() - scope.startedAt,
        })
      })
      sendError(res, new GatewayError(404))
      return
    }
    if (!health.isReady()) {
      sendError(res, new GatewayError(503))
      return
    }
    contexts.set(req, scope)
    shutdown.active.add(scope)
    const timer = setTimeout(() => {
      scope.abort()
      sendError(res, new GatewayError(503))
    }, config.http.requestTimeoutMs)
    const aborted = () => {
      scope.abort()
    }
    req.once('aborted', aborted)
    let complete = false
    const finish = () => {
      if (complete) return
      complete = true
      res.removeListener('finish', finish)
      res.removeListener('close', finish)
      clearTimeout(timer)
      req.removeListener('aborted', aborted)
      if (!res.writableFinished) scope.abort()
      shutdown.complete(scope)
      contexts.delete(req)

      // Атакующие ошибки агрегирует компонент ограничения; отдельного access-лога на них нет.
      if (![429, 503].includes(res.statusCode))
        logger.event('request', {
          requestId: scope.requestId,
          appId: route.appId,
          operationId: route.operation.operationId,
          route: route.route,
          method: req.method,
          status: res.statusCode,
          durationMs: performance.now() - scope.startedAt,
        })
    }
    res.once('finish', finish)
    res.once('close', finish)
    void (async () => {
      await options.beforeRequest?.(req, res, route, scope)
      if (scope.signal.aborted || res.writableEnded) throw new GatewayError(503)
      next()
    })().catch((error: unknown) => {
      sendError(res, error)
    })
  })
  const parser = express.json({ limit: config.http.bodyLimitBytes, strict: false })
  const suggestionParser = express.json({
    limit: Math.min(16384, config.http.bodyLimitBytes),
    strict: false,
  })
  app.use((req: Request, res: Response, next: NextFunction) => {
    const route = registry.resolve(req.method, req.path)
    if (!route) {
      next()
      return
    }
    if (route.binding.method.toUpperCase() !== 'GET' && !req.is('application/json')) {
      sendError(res, new GatewayError(415))
      return
    }
    const selected = route.operation['x-suggestion-rate-limit'] === true ? suggestionParser : parser
    selected(req, res, next)
  })
  app.use((req: Request, res: Response, next: NextFunction) => {
    const route = registry.resolve(req.method, req.path)
    if (!route) {
      next()
      return
    }
    validators.get(route.appId)?.(req, res, (error?: unknown) => {
      if (error) {
        sendError(res, error)
        return
      }
      try {
        access.assertAllowed(route.operation)
        next()
      } catch (cause) {
        sendError(res, cause)
      }
    })
  })
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    sendError(res, error)
  }
  app.use(errorHandler)
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: 'grpc.health.v1',
        protoPath: protoPath('grpc/health/v1/health.proto'),
        loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
        url: `${config.grpc.healthHost}:${config.grpc.healthPort}`,
      },
    },
    { inheritAppConfig: false },
  )
  await app.init()
  const discovered = app
    .get(DiscoveryService)
    .getControllers()
    .map((wrapper) => wrapper.metatype)
    .filter((type): type is Type => typeof type === 'function')
  registry.assertControllers(discovered, [HealthController, GrpcHealthController])
  return {
    app,
    registry,
    health,
    contexts,
    shutdown,
    logger,
    async listen() {
      try {
        await app.startAllMicroservices()
        await app.listen(config.http.port, config.http.host)
        health.markReady()
      } catch (error) {
        health.beginShutdown()
        await app.close()
        throw error
      }
    },

    /** Закрывает ресурс и освобождает связанные соединения. */
    async close() {
      await shutdown.stop()
    },
  }
}
