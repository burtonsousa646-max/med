// Визуальные тесты stories — ai/rules/testing.md, раздел «Визуальные тесты».
// Playwright открывает каждую story собранного Storybook и сравнивает скриншот с эталоном
// в папке snapshots/ рядом с компонентом.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const here = fileURLToPath(new URL('.', import.meta.url))

/**
 * @param {object} [options]
 * @param {number} [options.port] порт, на котором раздаётся собранный Storybook
 * @returns {import('@playwright/test').PlaywrightTestConfig}
 */
export function defineVisualConfig({ port = 6106 } = {}) {
  const pkg = process.cwd()
  const staticDir = join(pkg, 'storybook-static')
  // Тест читает список stories отсюда — и в основном процессе, и в воркерах.
  process.env.VISUAL_STORYBOOK_DIR = staticDir

  return defineConfig({
    testDir: here,
    testMatch: 'visual.spec.js',
    // Эталон — <папка компонента>/snapshots/<имя экспорта story>.png; путь передаёт сам тест.
    snapshotPathTemplate: join(pkg, '{arg}{ext}'),
    outputDir: join(pkg, 'test-results', 'visual'),
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    // Без повторов: нестабильный тест чинится, а не прячется за повтором.
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
      ...devices['Desktop Chrome'],
      baseURL: `http://127.0.0.1:${port}`,
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      colorScheme: 'light',
    },
    expect: {
      toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
    },
    webServer: {
      command: `node ${join(here, 'serve.mjs')} ${staticDir} ${port}`,
      url: `http://127.0.0.1:${port}/index.json`,
      reuseExistingServer: !process.env.CI,
    },
  })
}
