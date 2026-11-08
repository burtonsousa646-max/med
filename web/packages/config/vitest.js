// Общая настройка Vitest для приложений и пакетов frontend: jsdom, Testing Library, Vanilla Extract.
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vitest/config'

/**
 * Модульные тесты: `src/**\/*.test.{ts,tsx}`. Скрипт `test`.
 * Свой `include` пакета заменяет значение по умолчанию: mergeConfig склеивает массивы.
 * @param {import('vitest/config').ViteUserConfig} [overrides] дополнительные настройки пакета
 */
export function defineTestConfig(overrides = {}) {
  const { include, ...test } = overrides.test ?? {}
  return mergeConfig(
    defineConfig({
      plugins: [react(), vanillaExtractPlugin()],
      test: {
        environment: 'jsdom',
        setupFiles: [new URL('./vitest.setup.js', import.meta.url).pathname],
        include: include ?? ['src/**/*.test.{ts,tsx}'],
        css: true,
        restoreMocks: true,
      },
    }),
    { ...overrides, test },
  )
}
