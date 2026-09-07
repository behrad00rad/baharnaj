import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: 'theme.spec.js',
  use: {baseURL:'http://127.0.0.1:4174'},
  webServer: {command:'npm run preview -- --host 127.0.0.1 --port 4174',cwd:'../frontend',port:4174,reuseExistingServer:false},
})
