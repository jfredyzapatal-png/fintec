import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.mjs'],
    globalSetup: ['./tests/global-setup.mjs'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      include: ['fintec.core.generated.js'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './evidencia/coverage'
    }
  }
});
