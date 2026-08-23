const fs = require('fs');
const path = require('path');
const { startFixtureServer } = require('./fixture-server.cjs');

const APP_PORT = Number.parseInt(process.env.PLAYWRIGHT_APP_PORT || '3100', 10);
const FIXTURE_PORT = Number.parseInt(process.env.PLAYWRIGHT_FIXTURE_PORT || '18055', 10);
const runtimeRoot = path.join(process.cwd(), '.tmp', 'e2e-runtime');
const dataDir = path.join(runtimeRoot, 'data');
const downloadDir = path.join(runtimeRoot, 'downloads');

async function main() {
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.G1DM_E2E = '1';
  process.env.G1DM_DATA_DIR = dataDir;
  process.env.G1DM_SECRET_DIR = dataDir;
  process.env.G1DM_DOWNLOAD_DIR = downloadDir;
  process.env.G1DM_DB_PATH = path.join(dataDir, 'g1dm.db');
  process.env.G1DM_HOST = '0.0.0.0';
  process.env.PORT = String(APP_PORT);
  process.env.G1DM_TEST_SERVER_PORT = String(FIXTURE_PORT);

  const Chromium = require('@sparticuz/chromium').default;
  await Chromium.executablePath();

  const fixture = await startFixtureServer({ port: FIXTURE_PORT });
  const { createUnifiedServer } = require('../../dist/main/server.js');
  const app = await createUnifiedServer(APP_PORT);

  console.log(`[E2E] Fixture server ready at ${fixture.baseUrl}`);
  console.log(`[E2E] Download directory: ${downloadDir}`);
  console.log(`[E2E] App ready at http://127.0.0.1:${APP_PORT}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[E2E] Shutting down (${signal})`);

    try {
      app.db.flush();
    } catch {}

    await Promise.allSettled([
      new Promise((resolve) => app.server.close(resolve)),
      fixture.stop(),
    ]);

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[E2E] Failed to start stack:', error);
  process.exit(1);
});
