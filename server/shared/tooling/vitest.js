// Общая настройка Vitest для сервисов и пакетов backend.
// SWC нужен, чтобы в тестах работали декораторы NestJS и метаданные для DI.
import swc from 'unplugin-swc'
import { defineConfig, mergeConfig } from 'vitest/config'

function base({ include, ...test }) {
  return defineConfig({
    plugins: [
      swc.vite({
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2024',
        },
      }),
    ],
    test: { environment: 'node', include, restoreMocks: true, ...test },
  })
}

// mergeConfig склеивает массивы, поэтому include пакета заменяет include пресета, а не дополняет его.
function withOverrides(defaults, overrides) {
  const { include, ...test } = overrides.test ?? {}
  return mergeConfig(base({ ...defaults, include: include ?? defaults.include }), {
    ...overrides,
    test,
  })
}

/**
 * Модульные тесты: `src/**\/*.spec.ts`. Скрипт `test`.
 * @param {import('vitest/config').ViteUserConfig} [overrides] дополнительные настройки пакета
 */
export function defineTestConfig(overrides = {}) {
  return withOverrides({ include: ['src/**/*.spec.ts'] }, overrides)
}

/**
 * Интеграционные тесты с PostgreSQL и Redis из `pnpm env:up`: `test/**\/*.test.ts`. Скрипт `test:integration`.
 * Файлы запускаются по одному: тесты делят базу.
 * @param {import('vitest/config').ViteUserConfig} [overrides] дополнительные настройки пакета
 */
export function defineIntegrationTestConfig(overrides = {}) {
  return withOverrides(
    { include: ['test/**/*.test.ts'], fileParallelism: false, testTimeout: 30_000 },
    overrides,
  )
}
