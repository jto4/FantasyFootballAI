import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Windows CI runners are much slower on SQLite and child-process tests; keep the same
    // bounded timeout core uses rather than the 5 s default.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@sidekick/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
});
