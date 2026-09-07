import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'readability.spec.js',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173', cwd: '../frontend', port: 4173, reuseExistingServer: false },
})
