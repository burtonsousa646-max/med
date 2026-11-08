import type { ViteUserConfig } from 'vitest/config'

/** Модульные тесты: `src/**\/*.spec.ts`. Свой `include` пакета заменяет значение по умолчанию. */
export function defineTestConfig(overrides?: ViteUserConfig): ViteUserConfig

/** Интеграционные тесты: `test/**\/*.test.ts`, файлы по одному. Свой `include` заменяет значение по умолчанию. */
export function defineIntegrationTestConfig(overrides?: ViteUserConfig): ViteUserConfig
