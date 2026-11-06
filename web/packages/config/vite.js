// Общая настройка Vite для приложений: React, Vanilla Extract, Module Federation.
import { federation } from '@module-federation/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vite'

// Библиотеки, которые хост и микрофронтенды делят в одном экземпляре.
const SHARED = [
  'react',
  'react-dom',
  '@tanstack/react-router',
  '@tanstack/react-query',
  '@tanstack/react-store',
]

/**
 * @param {object} options
 * @param {string} options.name имя приложения в Module Federation, например `shell` или `cabinet`
 * @param {number} options.port порт dev-сервера
 * @param {Record<string, string>} [options.exposes] модули, которые отдаёт микрофронтенд
 * @param {Record<string, string>} [options.remotes] микрофронтенды, которые подключает хост
 * @param {import('vite').UserConfig} [options.overrides] дополнительные настройки приложения
 * @returns {import('vite').UserConfig}
 */
export function defineAppConfig({ name, port, exposes = {}, remotes = {}, overrides = {} }) {
  return mergeConfig(
    defineConfig({
      base: `/${name}/`,
      plugins: [
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
