import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'sms.spec.js',use:{baseURL:'http://127.0.0.1:4176'},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4176',cwd:'../frontend',port:4176,reuseExistingServer:false}});
