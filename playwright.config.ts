import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, retries: 0, timeout: 45000,
  reporter: 'list', outputDir: '/tmp/zilv-dazi-browser-results',
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4176', viewport: {width:390,height:844},
    launchOptions: process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH} : {} },
  webServer: process.env.TEST_BASE_URL ? undefined : {command:'npm run dev -- --port 4176',url:'http://127.0.0.1:4176',reuseExistingServer:true},
});
