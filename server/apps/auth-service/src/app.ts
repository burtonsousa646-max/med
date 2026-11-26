import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import { ExpressAdapter } from '@nestjs/platform-express'
import type { AuthConfig } from '@platform/config'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import { HealthState } from '@platform/health'
import { createPlatformLogger } from '@platform/logger'
import { RegisterProfile } from './application'
import { AuthModule, SERVICE_NAME } from './auth.module.ts'
import { EmailDeliveryWorker } from './infrastructure/prisma/email-delivery.ts'
import { AUTH_DATABASE, probeDatabase, type AuthDatabase } from './infrastructure/prisma'

/** Создаёт приложение и стандартные HTTP и gRPC проверки готовности. */
export async function createAuthApp(config: AuthConfig) {
  const logger = createPlatformLogger({
    service: SERVICE_NAME,
    version: config.version,
    env: config.env,
    level: config.logLevel,
  })
  const app = await NestFactory.create(AuthModule.forRoot(config), new ExpressAdapter(), {
    logger,
    abortOnError: false,
  })
  const grpcHost = config.grpc.host.includes(':') ? `[${config.grpc.host}]` : config.grpc.host
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: `${grpcHost}:${config.grpc.port}`,
      package: ['grpc.health.v1', 'platform.auth.v1'],
      protoPath: [protoPath('grpc/health/v1/health.proto'), protoPath('auth/v1/auth.proto')],
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
    },
  })

  const database = app.get<AuthDatabase>(AUTH_DATABASE)
  const health = app.get(HealthState)
  let timer: ReturnType<typeof setTimeout> | undefined
  let probe: Promise<void> | undefined
  let closing: Promise<void> | undefined

  const deliveries = app.get(EmailDeliveryWorker)
  let deliveryTimer: ReturnType<typeof setTimeout> | undefined
  let deliveryRun: Promise<void> | undefined
  function deliver(): void {
    deliveryRun = deliveries
      .runOne()
      .catch(() => {
        logger.event('failure', {}, 'warn')
      })
      .finally(() => {
        if (!closing) {
          deliveryTimer = setTimeout(deliver, 1000)
          deliveryTimer.unref()
        }
      })
  }

  const registrations = app.get(RegisterProfile)
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  let recovery: Promise<void> | undefined

  /** Обрабатывает незавершённые регистрации независимо от повторного запроса пользователя. */
  function recover(): void {
    recovery = registrations
      .recoverOne()
      .catch(() => {
        logger.event('failure', {}, 'warn')
      })
      .finally(() => {
        if (!closing) {
          recoveryTimer = setTimeout(recover, 1000)
          recoveryTimer.unref()
        }
      })
  }

  /** Один активный запрос на проверку, включая периоды недоступности PostgreSQL. */
  function checkReadiness(): void {
    if (closing) return
    probe = probeDatabase(database)
      .then(
        () => {
          health.markReady()
        },
        () => {
          if (health.isReady()) logger.event('failure', {}, 'warn')
          health.markNotReady()
        },
      )
      .finally(() => {
        if (!closing) {
          timer = setTimeout(checkReadiness, 1000)
          timer.unref()
        }
      })
  }

  /** Снимает готовность перед остановкой и освобождает пул PostgreSQL. */
  function close(): Promise<void> {
    closing ??= Promise.resolve().then(async () => {
      health.beginShutdown()
      clearTimeout(timer)
      clearTimeout(recoveryTimer)
      clearTimeout(deliveryTimer)
      await deliveryRun
      await recovery
      try {
        await app.close()
      } finally {
        await probe
        await database.$disconnect()
      }
    })
    return closing
  }

  /** Открывает транспорты, после чего проверяет доступность базы. */
  async function listen(): Promise<void> {
    try {
      await app.startAllMicroservices()
      await app.listen(config.http.port, config.http.host)
      checkReadiness()
      recover()
      deliver()
    } catch (error) {
      await close()
      throw error
    }
  }

  return { app, listen, close }
}
