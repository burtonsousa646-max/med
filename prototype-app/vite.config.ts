import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // дизайн-система лежит рядом, в ../design-system; /api — тестовый сервер из server/
  server: { host: '127.0.0.1', port: 5173, fs: { allow: ['..'] }, proxy: {
    '/api/autocomplete/': 'http://127.0.0.1:8788',
    '/api/business/lookup': 'http://127.0.0.1:8788',
    '/api': 'http://127.0.0.1:8787',
  } },
})
