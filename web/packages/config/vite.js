// Общая настройка Vite для приложений: TanStack Router, React, Vanilla Extract, Module Federation.
import { federation } from '@module-federation/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vite'

// Библиотеки, которые host и module web-приложения делят в одном экземпляре.
// Сюда входят пакеты, через контекст которых host передаёт module клиент API, store и провайдеры,
// в том числе провайдер feature toggles.
const SHARED = [
  'react',
  'react-dom',
  '@tanstack/react-router',
  '@tanstack/react-query',
  '@tanstack/react-store',
  '@platform/api-client',
  '@platform/web-feature-flags',
]

/**
 * @param {object} options
 * @param {string} options.name имя сборки в Module Federation: `<app>_host` или `<app>_<module>`, например `cabinet_host`, `cabinet_campaigns`
 * @param {number} options.port порт dev-сервера
 * @param {Record<string, string>} [options.exposes] что отдаёт module, например корневой компонент
 * @param {Record<string, string>} [options.remotes] module, которые загружает host
 * @param {import('vite').UserConfig} [options.overrides] дополнительные настройки приложения
 * @returns {import('vite').UserConfig}
 */
export function defineAppConfig({ name, port, exposes = {}, remotes = {}, overrides = {} }) {
  return mergeConfig(
    defineConfig({
      base: `/${name}/`,
      plugins: [
        // Файловый роутинг: маршруты — src/routes/, дерево маршрутов — src/routeTree.gen.ts (генерируется).
        // Должен стоять перед плагином React.
        tanstackRouter({
          target: 'react',
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
          autoCodeSplitting: true,
        }),
        react(),
        vanillaExtractPlugin(),
        federation({
          name,
          filename: 'remoteEntry.js',
          exposes,
          remotes,
          shared: Object.fromEntries(SHARED.map((lib) => [lib, { singleton: true }])),
          dts: false,
        }),
      ],
      server: { port, strictPort: true },
      preview: { port, strictPort: true },
      build: { target: 'es2024', outDir: 'dist', emptyOutDir: true },
    }),
    overrides,
  )
}
