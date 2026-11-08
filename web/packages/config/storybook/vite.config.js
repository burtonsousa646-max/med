// Vite для сборки Storybook: стили Vanilla Extract без Module Federation и роутера приложения.
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vanillaExtractPlugin()],
})
