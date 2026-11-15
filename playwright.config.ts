/**
 * Browser end-to-end tests. They start an isolated PLAYZO instance (API :5768, web :5767) with an
 * in-memory database, so nothing touches data/playzo.db. They drive the Microsoft Edge that ships
 * with Windows (channel 'msedge'), so no browser download is needed. Override with E2E_CHANNEL.
 *
 * The e2e admin password is generated per run and only exists in this process's environment.
 * Internal Lounge QA preview is switched on for this isolated instance only (localhost, tester role).
 */
import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

process.env.E2E_ADMIN_EMAIL ??= 'e2e-admin@playzo.test';
process.env.E2E_ADMIN_PASSWORD ??= randomBytes(12).toString('hex');
const channel = process.env.E2E_CHANNEL ?? 'msedge';
const WEB = 5767, API = 5768;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one browser at a time: parallel workers plus the dev servers overload a laptop CPU and cause timeouts
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'docs/e2e-results.json' }]],
  use: { baseURL: `http://localhost:${WEB}`, channel, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  outputDir: 'test-results',
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel, viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, viewport: { width: 390, height: 844 } }, testMatch: /(smoke|family|auth|journey)\.spec\.ts/ },
  ],
  webServer: {
    command: 'npx concurrently -k -n api,web "npx tsx server/index.ts" "node scripts/wait-api.mjs && npx vite"',
    url: `http://localhost:${WEB}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PLAYZO_API_PORT: String(API), PLAYZO_WEB_PORT: String(WEB), PLAYZO_DB_PATH: ':memory:', PLAYZO_PUBLIC_URL: `http://localhost:${WEB}`,
      PLAYZO_DEV_MODE: 'true', PLAYZO_ADULT_DEV_PREVIEW: 'true', PLAYZO_LOUNGE_ENABLED: 'false', PLAYZO_LEGAL_APPROVALS: '',
      PLAYZO_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL!, PLAYZO_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD!, PLAYZO_RATE_LIMIT_MULTIPLIER: '50',
      PLAYZO_EMAIL_PROVIDER: 'outbox',
    },
  },
});
