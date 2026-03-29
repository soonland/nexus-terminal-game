import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['src/mocks/setup.ts'],
    include: ['api/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['api/**/*.ts', 'src/**/*.ts'],
      exclude: [
        'api/**/*.test.ts',
        'src/**/*.test.ts',
        'src/App.tsx',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/components/**',
        'src/hooks/**',
        'src/mocks/**',
      ],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
        perFile: true,
      },
    },
  },
});
