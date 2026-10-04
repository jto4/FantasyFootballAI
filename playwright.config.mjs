import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  timeout: 30000,
  fullyParallel: true,
  outputDir: join(tmpdir(), 'sidekick-browser-results'),
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4201', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/dashboard-preview.mjs',
    url: 'http://127.0.0.1:4201',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
