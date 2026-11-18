// Автотесты API через API Gateway — ai/rules/testing.md, раздел «Автотесты API и e2e».
// Тесты фичи — specs/<NNN-slug>/, в названии теста — номер тестового случая TC из test-plan.md.
import { defineConfig } from '@playwright/test'

// Адрес API Gateway; на стенде задаётся переменной окружения. Боевое окружение запрещено.
const baseURL = process.env.API_URL ?? 'http://127.0.0.1:8080/api/'

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Без повторов: нестабильный тест чинится, а не прячется за повтором.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    extraHTTPHeaders: { accept: 'application/json' },
  },
})
