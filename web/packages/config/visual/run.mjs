#!/usr/bin/env node
// Запуск визуальных тестов stories в одинаковом окружении на Mac и в CI — ai/rules/testing.md.
//
// Отрисовка шрифтов на macOS и Linux отличается, поэтому скриншоты снимаются и сравниваются
// в официальном Docker-образе Playwright той же версии, что и @playwright/test.
// Storybook собирается на машине заранее (storybook-static/): статическая сборка от платформы не зависит.
//
//   platform-visual [аргументы playwright test]     — в Docker
//   platform-visual --update-snapshots              — обновить эталоны в snapshots/
//   platform-visual --dry-run                       — показать команду docker и выйти
//   VISUAL_DOCKER=0 platform-visual                 — без Docker: CI уже работает внутри образа Playwright
//   PLAYWRIGHT_IMAGE=<образ> platform-visual        — другой образ
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const playwrightCli = require.resolve('@playwright/test/cli')
const playwrightVersion = JSON.parse(
  readFileSync(require.resolve('@playwright/test/package.json'), 'utf8'),
).version

const pkg = process.cwd()
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const playwrightArgs = [
  'test',
  '-c',
  'playwright.visual.config.ts',
  '--pass-with-no-tests',
  ...args.filter((arg) => arg !== '--dry-run'),
]

function findRoot(dir) {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
  const parent = dirname(dir)
  if (parent === dir)
    throw new Error('Не найден корень репозитория: нет pnpm-workspace.yaml выше по каталогам')
  return findRoot(parent)
}

function run(command, commandArgs) {
  if (dryRun) {
    process.stdout.write(`${[command, ...commandArgs].join(' ')}\n`)
    return 0
  }
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (!existsSync(join(pkg, 'storybook-static', 'index.json'))) {
  process.stderr.write(
    'Нет storybook-static/index.json: сначала соберите Storybook — storybook build -o storybook-static\n',
  )
  process.exit(1)
}

// Уже внутри образа Playwright — запускаем тесты напрямую.
if (process.env.VISUAL_IN_DOCKER === '1' || process.env.VISUAL_DOCKER === '0') {
  process.exit(run(process.execPath, [playwrightCli, ...playwrightArgs]))
}

if (!dryRun && spawnSync('docker', ['version'], { stdio: 'ignore' }).status !== 0) {
  process.stderr.write(
    'Визуальные тесты запускаются в Docker, а Docker недоступен. Установите и запустите Docker Desktop.\n' +
      'Если окружение уже работает внутри образа Playwright, запустите с VISUAL_DOCKER=0.\n',
  )
  process.exit(1)
}

const root = findRoot(pkg)
const image =
  process.env.PLAYWRIGHT_IMAGE ?? `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`
const dockerArgs = [
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  // Репозиторий монтируется по тому же пути: абсолютные пути в конфигурации и эталонах совпадают.
  '-v',
  `${root}:${root}`,
  '-w',
  pkg,
  '-e',
  'VISUAL_IN_DOCKER=1',
  '-e',
  'HOME=/tmp',
  ...(process.env.CI ? ['-e', 'CI'] : []),
  // На Linux файлы эталонов создаются от имени текущего пользователя, а не root.
  ...(process.platform === 'linux' && process.getuid && process.getgid
    ? ['--user', `${process.getuid()}:${process.getgid()}`]
    : []),
  ...(process.stdout.isTTY ? ['-t'] : []),
  image,
  'node',
  playwrightCli,
  ...playwrightArgs,
]

process.exit(run('docker', dockerArgs))
