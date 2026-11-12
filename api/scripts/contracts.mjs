// Проверка, поиск ломающих изменений и генерация кода из контрактов.
// Правила — ai/rules/api-contracts.md. Запуск — через скрипты пакета @platform/api:
//   pnpm --filter @platform/api lint | breaking | generate
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(apiDir, '..')
const bin = (name) => join(apiDir, 'node_modules', '.bin', name)

// Куда генерируется код. Пакет-получатель создаёт его владелец; пока пакета нет, генерация в него пропускается.
const OPENAPI_TARGETS = [
  { pkg: 'web/packages/api-client', dir: 'web/packages/api-client/src/generated' },
  { pkg: 'server/apps/api-gateway', dir: 'server/apps/api-gateway/src/generated' },
]
const PROTO_TARGET = 'server/shared/contracts'

function files(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(ext))
    .map((f) => join(dir, f))
    .sort()
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: apiDir, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function log(message) {
  process.stdout.write(`${message}\n`)
}

const openapi = files(join(apiDir, 'openapi'), '.yaml')
const proto = files(join(apiDir, 'proto'), '.proto')

function lint() {
  if (openapi.length > 0) run(bin('redocly'), ['lint', ...openapi])
  else log('OpenAPI: контрактов в api/openapi/ нет — пропущено')

  if (proto.length > 0) run(bin('buf'), ['lint'])
  else log('protobuf: контрактов в api/proto/ нет — пропущено')
}

function breaking() {
  if (proto.length === 0) {
    log('protobuf: контрактов в api/proto/ нет — пропущено')
    return
  }
  const base = process.env.CONTRACTS_BASE ?? 'develop'
  const hasBase =
    spawnSync('git', ['cat-file', '-e', `${base}:api/buf.yaml`], { cwd: root }).status === 0
  if (!hasBase) {
    log(`protobuf: в ${base} ещё нет api/buf.yaml — сравнивать не с чем, пропущено`)
    return
  }
  run(bin('buf'), ['breaking', '--against', `../.git#branch=${base},subdir=api`])
}

function generate() {
  for (const target of OPENAPI_TARGETS) {
    if (!existsSync(join(root, target.pkg, 'package.json'))) {
      log(`OpenAPI: пакета ${target.pkg} нет — генерация в него пропущена`)
      continue
    }
    mkdirSync(join(root, target.dir), { recursive: true })
    for (const file of openapi) {
      run(bin('openapi-typescript'), [
        file,
        '-o',
        join(root, target.dir, `${basename(file, '.yaml')}.ts`),
      ])
    }
  }
  if (openapi.length === 0) log('OpenAPI: контрактов в api/openapi/ нет — генерировать нечего')

  if (proto.length === 0) {
    log('protobuf: контрактов в api/proto/ нет — генерировать нечего')
  } else if (!existsSync(join(root, PROTO_TARGET, 'package.json'))) {
    log(`protobuf: пакета ${PROTO_TARGET} нет — генерация пропущена`)
  } else {
    run(bin('buf'), ['generate'])
  }
}

const commands = { lint, breaking, generate }
const command = commands[process.argv[2]]
if (!command) {
  process.stderr.write(`Команда: ${Object.keys(commands).join(' | ')}\n`)
  process.exit(1)
}
command()
