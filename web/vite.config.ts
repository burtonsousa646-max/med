import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Интерфейс кабинета. /api проксируется на сервер платформы, поэтому cookie и колбэки входа живут на одном адресе.
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, proxy: { '/api': 'http://127.0.0.1:8788' } },
  build: { outDir: '../dist', emptyOutDir: true },
})
