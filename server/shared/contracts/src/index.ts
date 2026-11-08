// Код gRPC для сервисов и API Gateway — ai/rules/api-contracts.md, раздел «Генерация кода».
//
// Интерфейсы сообщений, клиентов и контроллеров генерируются из api/proto/ в src/generated/
// командой `pnpm --filter @platform/api generate` и руками не правятся. Импорт — по пути proto-файла:
//   import type { CampaignsServiceController } from '@platform/contracts/campaigns/v1/campaigns'
//
// Сериализацию выполняет @grpc/proto-loader по самим .proto-файлам. Они копируются в пакет при сборке,
// путь к ним — protoPath(), опции загрузки — PROTO_LOADER_OPTIONS:
//   ClientsModule.register([{ transport: Transport.GRPC, options: {
//     package: 'platform.campaigns.v1',
//     protoPath: protoPath('campaigns/v1/campaigns.proto'),
//     loader: PROTO_LOADER_OPTIONS,
//   } }])
import { fileURLToPath } from 'node:url'

/** Каталог с .proto-файлами внутри собранного пакета. */
export const PROTO_ROOT = fileURLToPath(new URL('./proto/', import.meta.url))

/** Абсолютный путь к .proto-файлу относительно api/proto/, например `campaigns/v1/campaigns.proto`. */
export function protoPath(file: string): string {
  return fileURLToPath(new URL(file, new URL('./proto/', import.meta.url)))
}

/**
 * Опции @grpc/proto-loader, при которых данные во время работы совпадают со сгенерированными типами
 * (настройки ts-proto — api/buf.gen.yaml):
 * - поля в camelCase;
 * - int64 — строкой, поэтому деньги в копейках приходят строкой и переводятся в bigint на границе сервиса;
 * - перечисления — строками;
 * - отсутствующие поля заполняются значениями по умолчанию.
 */
export const PROTO_LOADER_OPTIONS = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_ROOT],
} as const
