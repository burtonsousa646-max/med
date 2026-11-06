// Общая настройка Vitest для приложений и пакетов frontend: jsdom, Testing Library, Vanilla Extract.
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vitest/config'

/**
 * @param {import('vitest/config').ViteUserConfig} [overrides] дополнительные настройки пакета
 */
export function defineTestConfig(overrides = {}) {
  return mergeConfig(
    defineConfig({
      plugins: [react(), vanillaExtractPlugin()],
      test: {
        environment: 'jsdom',
        setupFiles: [new URL('./vitest.setup.js', import.meta.url).pathname],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        css: true,
        restoreMocks: true,
      },
    }),
    overrides,
  )
}
