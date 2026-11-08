// Общая настройка Storybook для host и module web-приложений — ai/rules/frontend.md, раздел «Storybook».
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Фреймворк и Vite-конфигурация берутся из этого пакета, а не из host или module:
// сборке Storybook не нужны Module Federation и роутер приложения.
const framework = dirname(fileURLToPath(import.meta.resolve('@storybook/react-vite/package.json')))
const viteConfigPath = fileURLToPath(new URL('./vite.config.js', import.meta.url))

/**
 * @param {import('@storybook/react-vite').StorybookConfig | Record<string, never>} [overrides] дополнительные настройки пакета
 * @returns {import('@storybook/react-vite').StorybookConfig}
 */
export function defineStorybookConfig(overrides = {}) {
  return {
    // Stories лежат рядом с компонентами: src/components/<Component>/<Component>.stories.tsx
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    framework: { name: framework, options: { builder: { viteConfigPath } } },
    // Телеметрия выключена: данные платформы не уходят во внешние сервисы — ai/rules/security.md.
    core: { disableTelemetry: true, disableWhatsNewNotifications: true },
    ...overrides,
  }
}
