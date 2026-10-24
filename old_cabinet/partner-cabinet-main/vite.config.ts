/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { localApiPlugin } from './vite-plugins/localApi.js'

export default defineConfig(({ mode }) => {
  // Читаем .env/.env.local БЕЗ требования префикса VITE_ — секрет нужен только
  // серверному dev-middleware (localApiPlugin), в клиентский бандл он не попадает.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['OPENAI_API_KEY', 'OPENAI_CHAT_MODEL', 'OPENAI_IMAGE_MODEL']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
