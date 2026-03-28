import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['api/**/*.ts'],
      exclude: ['api/**/*.test.ts'],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
    },
  },
})
