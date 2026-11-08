// Один визуальный тест на каждую story собранного Storybook.
// Эталон лежит рядом с компонентом: src/components/<Component>/snapshots/<имя экспорта story>.png
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { expect, test } from '@playwright/test'

const staticDir = process.env.VISUAL_STORYBOOK_DIR ?? ''
const indexFile = join(staticDir, 'index.json')

if (!existsSync(indexFile)) {
  throw new Error(
    `Нет ${indexFile}: сначала соберите Storybook — скрипт test:visual делает это сам`,
  )
}

/** @type {{ entries: Record<string, { id: string, title: string, name: string, type: string, importPath: string, exportName: string }> }} */
const index = JSON.parse(readFileSync(indexFile, 'utf8'))
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story')

for (const story of stories) {
  test(`${story.title} › ${story.name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`)

    // Storybook ставит на body класс sb-show-main после отрисовки story и sb-show-errordisplay при ошибке.
    await page.waitForFunction(
      () =>
        document.body.classList.contains('sb-show-main') ||
        document.body.classList.contains('sb-show-errordisplay'),
    )
    await expect(page.locator('body'), 'story упала с ошибкой').not.toHaveClass(
      /sb-show-errordisplay/,
    )
    await page.evaluate(() => document.fonts.ready)

    const componentDir = dirname(story.importPath)
      .split('/')
      .filter((part) => part !== '' && part !== '.')
    await expect(page.locator('#storybook-root')).toHaveScreenshot([
      ...componentDir,
      'snapshots',
      `${story.exportName}.png`,
    ])
  })
}
