import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:5173' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', cwd: './frontend', port: 5173, reuseExistingServer: true },
})
