// Копирует api/proto/ в dist/proto/: .proto-файлы нужны @grpc/proto-loader во время работы сервиса.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(pkg, '..', '..', '..', 'api', 'proto')
const target = join(pkg, 'dist', 'proto')

rmSync(target, { recursive: true, force: true })
if (existsSync(source)) {
  cpSync(source, target, { recursive: true, filter: (path) => !path.endsWith('.gitkeep') })
}
