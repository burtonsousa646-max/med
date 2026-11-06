// Общая настройка Vitest для сервисов и пакетов backend.
// SWC нужен, чтобы в тестах работали декораторы NestJS и метаданные для DI.
import swc from 'unplugin-swc'
import { defineConfig, mergeConfig } from 'vitest/config'

/**
 * @param {import('vitest/config').ViteUserConfig} [overrides] дополнительные настройки пакета
 */
export function defineTestConfig(overrides = {}) {
  return mergeConfig(
    defineConfig({
      plugins: [
        swc.vite({
          jsc: {
            parser: { syntax: 'typescript', decorators: true },
            transform: { legacyDecorator: true, decoratorMetadata: true },
            target: 'es2024',
          },
        }),
      ],
      test: {
        environment: 'node',
        include: ['src/**/*.spec.ts', 'test/**/*.test.ts'],
        restoreMocks: true,
      },
    }),
    overrides,
  )
}
