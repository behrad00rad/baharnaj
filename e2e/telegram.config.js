import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'telegram.spec.js',
  timeout: 60000,
  workers: 1,
  use: {
    browserName: process.env.TELEGRAM_TEST_BROWSER || 'chromium',
    baseURL: 'http://127.0.0.1:4177',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4177',
    cwd: '../frontend',
    port: 4177,
    reuseExistingServer: false,
  },
})
