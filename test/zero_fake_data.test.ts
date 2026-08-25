/**
 * ZERO FAKE DATA acceptance tests.
 *
 * Guarantees enforced here:
 *  1. A fresh G1DM installation contains 0 downloads, 0 queue entries,
 *     and 0 history records.
 *  2. Starting the DownloadEngine on a fresh database creates no downloads,
 *     no queues, no history, and no files — startup initializes services only.
 *  3. Queue records are materialized lazily, only when a real user action
 *     adds a download that targets one.
 *  4. Exactly one real download job is created per user add action, and its
 *     bytes on disk match the real source.
 *
 * These tests exist to make it impossible to reintroduce seeded/demo/mock
 * download data into production startup paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createTestServer } from './fixtures/test-server';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { AppDatabase } from '../src/main/db/Database';

const TEST_DOWNLOAD_DIR = path.join(__dirname, '__zero_fake_data_downloads__');

function cleanTestDir() {
  if (fs.existsSync(TEST_DOWNLOAD_DIR)) {
    fs.rmSync(TEST_DOWNLOAD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DOWNLOAD_DIR, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 30000,
  intervalMs: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return true;
    await sleep(intervalMs);
  }
  return false;
}

async function makeFreshEngine(dbPath: string) {
  const db = new AppDatabase(dbPath);
  await db.init();
  const settings = db.getSettings();
  settings.general.defaultDownloadDir = TEST_DOWNLOAD_DIR;
  db.saveSettings(settings);
  const engine = new DownloadEngine(db);
  await engine.init();
  return { db, engine };
}

describe('ZERO FAKE DATA: fresh install contains no download state', () => {
  let db: AppDatabase;
  const tempDir = path.join(__dirname, '__zero_fake_db__');

  beforeEach(async () => {
    cleanTestDir();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    db = new AppDatabase(path.join(tempDir, 'fresh-install.db'));
    await db.init();
  });

  afterEach(() => {
    try { db.close(); } catch {}
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('seeds zero downloads, zero queue entries, and zero history records', () => {
    expect(db.getAllDownloads()).toHaveLength(0);
    expect(db.getQueues()).toHaveLength(0);
    expect(db.getHistory()).toHaveLength(0);
  });

  it('still seeds operational configuration (settings + category rules), which is not download data', () => {
    expect(db.getSettings()).toBeDefined();
    // Category rules are user-facing classification configuration, not downloads.
    expect(db.getCategories().length).toBeGreaterThan(0);
  });

  it('does not create any files in the download directory at initialization', () => {
    const entries = fs.existsSync(TEST_DOWNLOAD_DIR) ? fs.readdirSync(TEST_DOWNLOAD_DIR) : [];
    expect(entries).toHaveLength(0);
  });
});

describe('ZERO FAKE DATA: engine startup is inert without user action', () => {
  jest.setTimeout(30000);

  it('initializes with zero downloads, zero queues, and starts nothing on its own', async () => {
    cleanTestDir();
    const tempDir = path.join(__dirname, '__zero_fake_engine__');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const { db, engine } = await makeFreshEngine(path.join(tempDir, 'engine-fresh.db'));

    // Give the engine scheduler loop time to run several ticks.
    await sleep(2500);

    expect(engine.getAllDownloads()).toHaveLength(0);
    expect(db.getQueues()).toHaveLength(0);
    expect(db.getHistory()).toHaveLength(0);

    const dirEntries = fs.existsSync(TEST_DOWNLOAD_DIR) ? fs.readdirSync(TEST_DOWNLOAD_DIR) : [];
    expect(dirEntries).toHaveLength(0);

    await engine.shutdown();
    db.close();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('ZERO FAKE DATA: real user action creates exactly one real job', () => {
  jest.setTimeout(60000);

  it('creates exactly one download + lazily materializes only the queue it needs', async () => {
    cleanTestDir();
    const tempDir = path.join(__dirname, '__zero_fake_real__');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const serverInfo = await createTestServer();
    const { db, engine } = await makeFreshEngine(path.join(tempDir, 'real-add.db'));

    // Still zero queues before any user action.
    expect(db.getQueues()).toHaveLength(0);

    // Real user action: add one URL and start it.
    const fileUrl = `${serverInfo.baseUrl}/files/basic.bin`;
    const item = await engine.addDownload({ url: fileUrl, startImmediately: true });

    expect(engine.getAllDownloads()).toHaveLength(1);
    expect(db.getAllDownloads()).toHaveLength(1);

    // Lazy queue creation: exactly the queue this download targets, nothing else.
    expect(db.getQueues()).toHaveLength(1);
    expect(db.getQueues()[0].id).toBe(item.queueId);

    // Real transfer completes and writes the real file.
    const completed = await waitFor(
      () => engine.getDownload(item.id)?.status === 'completed',
      30000
    );
    expect(completed).toBe(true);

    const finalItem = engine.getDownload(item.id)!;
    expect(finalItem.downloadedBytes).toBe(1024 * 1024);
    expect(fs.existsSync(finalItem.finalPath)).toBe(true);
    expect(fs.statSync(finalItem.finalPath).size).toBe(1024 * 1024);

    // Real history entry created by the real completion — exactly one.
    await sleep(300);
    expect(db.getHistory().length).toBe(1);

    await engine.shutdown();
    db.close();
    await serverInfo.stop();
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
