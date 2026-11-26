import 'reflect-metadata'
import { readFile } from 'node:fs/promises'
import { ServerCredentials } from '@grpc/grpc-js'
import { NestFactory } from '@nestjs/core'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import { ExpressAdapter } from '@nestjs/platform-express'
import type { readNotificationsConfig } from '@platform/config'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
import { HealthState } from '@platform/health'
import { NotificationsDatabase } from './infrastructure/prisma'
import { NotificationsModule } from './notifications.module.ts'
import type { RpcOptions } from './rpc.types.ts'

/** Сервер принимает только клиентов с сертификатами назначенного CA. */
export async function createNotificationsApp(
  config: ReturnType<typeof readNotificationsConfig>,
  transports: RpcOptions['transports'] = new Map(),
  routing: Pick<RpcOptions, 'externalEmail' | 'enableFeatureFlags'> = {},
) {
  const [ca, cert_chain, private_key] = (await Promise.all(
    [config.tls.ca, config.tls.cert, config.tls.key].map((path) => readFile(path)),
  )) as [Buffer, Buffer, Buffer]
  const app = await NestFactory.create(
    NotificationsModule.forRoot(config.databaseUrl, config.keys, {
      ...config,
      transports,
      ...routing,
    }),
    new ExpressAdapter(),
    { logger: false, abortOnError: false },
  )
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url:
        (config.host.includes(':') ? '[' + config.host + ']' : config.host) +
        ':' +
        String(config.port),
      package: ['platform.notifications.v1', 'grpc.health.v1'],
      protoPath: [
        protoPath('notifications/v1/notifications.proto'),
        protoPath('grpc/health/v1/health.proto'),
      ],
      loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
      credentials: ServerCredentials.createSsl(ca, [{ cert_chain, private_key }], true),
    },
  })
  const health = app.get(HealthState)
  const database = app.get(NotificationsDatabase)
  health.setDependencyProbe(databaseProbe(database))

  async function close() {
    health.beginShutdown()
    await app.close()
  }
  async function listen() {
    try {
      await app.startAllMicroservices()
      await app.listen(config.http.port, config.http.host)
      health.markReady()
    } catch (error) {
      await close()
      throw error
    }
  }
  return { app, listen, close }
}

/** Повторные пробы разделяют запрос к базе, даже если его ответ задерживается. */
function databaseProbe(db: NotificationsDatabase) {
  let pending: Promise<boolean> | undefined
  return async () => {
    pending ??= db.$queryRaw`SELECT 1`
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        pending = undefined
      })
    const deadline = Promise.withResolvers<boolean>()
    const timer = setTimeout(() => {
      deadline.resolve(false)
    }, 500)
    try {
      return await Promise.race([pending, deadline.promise])
    } finally {
      clearTimeout(timer)
    }
  }
}
