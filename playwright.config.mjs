import { defineConfig, devices } from '@playwright/test';
import Chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const chromiumEntry = require.resolve('@sparticuz/chromium');
const chromiumBinDir = path.join(path.dirname(chromiumEntry), '..', 'bin');
const appPort = Number.parseInt(process.env.PLAYWRIGHT_APP_PORT || '3100', 10);

await inflate(path.join(chromiumBinDir, 'al2023.tar.br'));
setupLambdaEnvironment(path.join(tmpdir(), 'al2023', 'lib'));
const chromiumExecutablePath = process.env.CHROMIUM_EXECUTABLE_PATH || await Chromium.executablePath();

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 1000 },
    reuseContext: true,
    launchOptions: {
      executablePath: chromiumExecutablePath,
      args: Chromium.args,
    },
  },
  webServer: {
    command: 'node test/e2e/start-stack.cjs',
    url: `http://127.0.0.1:${appPort}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
