import 'reflect-metadata'
import { readFile } from 'node:fs/promises'
import { ServerCredentials } from '@grpc/grpc-js'
import { NestFactory } from '@nestjs/core'
import { Transport, type MicroserviceOptions } from '@nestjs/microservices'
import type { readNotificationsConfig } from '@platform/config'
import { protoPath, PROTO_LOADER_OPTIONS } from '@platform/contracts'
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
  return NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationsModule.forRoot(config.databaseUrl, config.keys, {
      ...config,
      transports,
      ...routing,
    }),
    {
      logger: false,
      abortOnError: false,
      transport: Transport.GRPC,
      options: {
        url:
          (config.host.includes(':') ? '[' + config.host + ']' : config.host) +
          ':' +
          String(config.port),
        package: 'platform.notifications.v1',
        protoPath: protoPath('notifications/v1/notifications.proto'),
        loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [...PROTO_LOADER_OPTIONS.includeDirs] },
        credentials: ServerCredentials.createSsl(ca, [{ cert_chain, private_key }], true),
      },
    },
  )
}
