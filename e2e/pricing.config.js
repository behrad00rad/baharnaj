import { defineConfig } from '@playwright/test'
export default defineConfig({testDir:'.',testMatch:'pricing.spec.js',use:{baseURL:'http://127.0.0.1:4175'},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4175',cwd:'../frontend',port:4175,reuseExistingServer:false}})
