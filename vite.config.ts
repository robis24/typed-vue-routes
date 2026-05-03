import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        plugin: 'src/plugin.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue',
        'vue-router',
        'vite',
        'typescript',
        'node:fs',
        'node:path',
        'node:os',
      ],
    },
  },
  test: {
    environment: 'node',
  },
})
