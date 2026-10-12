import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/smoke/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['tests/setup/noNetwork.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
