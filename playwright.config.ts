import { defineConfig, devices } from '@playwright/test'

// The loop runs against its own Next server on 3101 (npm run dev:test: .env.test, oshofree_test, .next-e2e),
// never the dev server on 3100 or the development database. Run it with `npm run test:e2e`, which resets and seeds first.
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Next dev compiles each page on its first visit, so the one long test gets room.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev:test',
    url: 'http://localhost:3101/sign-in',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
