import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // дизайн-система лежит рядом, в ../design-system
  server: { port: 5173, fs: { allow: ['..'] } },
})
