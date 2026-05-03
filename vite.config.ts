import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import typedRoutes from './vite-plugin-typed-routes'

export default defineConfig({
  plugins: [vue(), typedRoutes()],
  test: {
    environment: 'node',
  },
})
