// Заводит в Unleash флаги из deploy/unleash/flags.json — specs/architecture/adr/0001-feature-toggles.md.
// Запуск: pnpm env:flags (вызывается и из pnpm env:up).
// Идемпотентен: существующий флаг не меняется, его положение не перетирается. Новый флаг создаётся
// выключенным, со стратегией «всем» в окружении UNLEASH_ENVIRONMENT, — его включают в админке Unleash.
// Флаги, которых нет в flags.json, не удаляются — о них выводится предупреждение.
import { readFile } from 'node:fs/promises'

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*){2}$/
const TYPES = new Set(['release', 'kill-switch', 'operational'])

const adminUrl = required('UNLEASH_ADMIN_URL')
const token = required('UNLEASH_ADMIN_TOKEN')
const environment = process.env.UNLEASH_ENVIRONMENT ?? 'development'
const project = process.env.UNLEASH_PROJECT ?? 'default'
const projectUrl = `${adminUrl}/projects/${project}/features`

const { flags } = JSON.parse(await readFile(new URL('flags.json', import.meta.url), 'utf8'))
for (const flag of flags) validate(flag)

const existing = new Set((await call('GET', projectUrl)).features.map((f) => f.name))

for (const flag of flags) {
  if (existing.has(flag.name)) {
    log(`= ${flag.name}`)
    continue
  }
  await call('POST', projectUrl, {
    name: flag.name,
    type: flag.type,
    description: `${flag.description} Спецификация: specs/features/${flag.spec}/design.md`,
  })
  await call('POST', `${projectUrl}/${flag.name}/environments/${environment}/strategies`, {
    name: 'flexibleRollout',
    parameters: { rollout: '100', stickiness: 'default', groupId: flag.name },
  })
  log(`+ ${flag.name} — создан выключенным`)
}

const declared = new Set(flags.map((f) => f.name))
for (const name of existing) {
  if (!declared.has(name)) log(`! ${name} — есть в Unleash, но нет в flags.json`)
}
log(`Флагов в flags.json: ${flags.length}`)

function validate(flag) {
  const where = `flags.json: ${JSON.stringify(flag.name)}`
  if (typeof flag.name !== 'string' || !NAME.test(flag.name))
    fail(`${where} — имя не по правилу <область>.<фича>.<что включает> в kebab-case`)
  if (!TYPES.has(flag.type)) fail(`${where} — type: release, kill-switch или operational`)
  if (typeof flag.description !== 'string' || flag.description === '')
    fail(`${where} — нет description`)
  if (typeof flag.spec !== 'string' || !/^\d{3}-[a-z0-9-]+$/.test(flag.spec))
    fail(`${where} — spec: каталог фичи NNN-slug`)
}

async function call(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    fail(
      `Unleash недоступен по ${adminUrl}: ${error.message}. Запущено ли окружение — pnpm env:up?`,
    )
  }
  if (!res.ok) fail(`${method} ${url} — ${res.status}: ${await res.text()}`)
  return res.status === 204 ? undefined : res.json().catch(() => undefined)
}

function required(name) {
  const value = process.env[name]
  if (!value) fail(`Нет переменной ${name}: скопируйте deploy/.env.example в deploy/.env`)
  return value
}

function log(message) {
  process.stdout.write(`unleash: ${message}\n`)
}

function fail(message) {
  process.stderr.write(`unleash: ${message}\n`)
  process.exit(1)
}
