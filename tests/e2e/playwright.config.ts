// E2E — сценарии пользователя через frontend, gateway и сервисы — ai/rules/testing.md, раздел «Автотесты API и e2e».
// Тесты фичи — specs/<NNN-slug>/, в названии теста — номер тестового случая TC из test-plan.md.
// Браузер ставится один раз: pnpm --filter @platform/e2e browsers
import { defineConfig, devices } from '@playwright/test'

// Адрес frontend (shell); на стенде задаётся переменной окружения. Боевое окружение запрещено.
const baseURL = process.env.APP_URL ?? 'http://127.0.0.1:5200/'

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Без повторов: нестабильный тест чинится, а не прячется за повтором.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
