import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Screenshot tests for the development UI state gallery (apps/dashboard/states.html). Baselines
// are macOS renders; refresh them with `npm run test:ui-states -- --update-snapshots` after an
// intended visual change and review the image diff before committing.
export default defineConfig({
  testDir: './e2e-states',
  testMatch: '**/*.pw.ts',
  timeout: 30000,
  fullyParallel: true,
  outputDir: join(tmpdir(), 'sidekick-ui-states-results'),
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  reporter: 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: 'http://127.0.0.1:4202',
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  webServer: {
    command:
      'npm run build:states -w @sidekick/dashboard && node scripts/dashboard-preview.mjs --states',
    url: 'http://127.0.0.1:4202',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'light', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'dark', use: { viewport: { width: 1280, height: 900 } } },
  ],
});
