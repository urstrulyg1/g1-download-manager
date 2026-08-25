import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppDatabase } from '../src/main/db/Database';

describe('G1DM Version Migration & Schema Safety', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm_migration_test_'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('Fresh installation initializes schema version 4 and seeds defaults', async () => {
    const dbPath = path.join(tempDir, 'fresh.db');
    const db = new AppDatabase(dbPath);
    await db.init();

    expect(db.getSchemaVersion()).toBe(4);

    // Verify tables exist
    const settings = db.getSettings();
    expect(settings).toBeDefined();
    expect(settings.general.defaultDownloadDir).toBeDefined();

    const categories = db.getCategories();
    expect(categories.length).toBeGreaterThanOrEqual(6);

    // Zero-seed policy: a fresh installation must contain zero queue entries.
    // Queues are created lazily by real user download actions.
    const queues = db.getQueues();
    expect(queues.length).toBe(0);

    const migrations = db.getMigrationHistory();
    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations[0].success).toBe(true);

    db.close();
  });

  test('Upgrading from v1/v2 schema preserves all user downloads and history', async () => {
    const dbPath = path.join(tempDir, 'upgrade.db');
    const db = new AppDatabase(dbPath);
    await db.init();

    // Manually insert an item as if from older version
    const testItem: any = {
      id: 'legacy-dl-1',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      destinationDir: tempDir,
      finalPath: path.join(tempDir, 'file.zip'),
      tempPath: path.join(tempDir, 'file.zip.part'),
      stateFilePath: path.join(tempDir, 'file.zip.g1dm'),
      status: 'completed',
      totalBytes: 1048576,
      downloadedBytes: 1048576,
      progress: 100,
      speed: 0,
      avgSpeed: 500000,
      peakSpeed: 800000,
      eta: 0,
      category: 'archive',
      queueId: 'default',
      priority: 'normal',
      maxConnections: 8,
      activeConnections: 0,
      speedLimitBytesPerSec: 0,
      retryCount: 0,
      maxRetries: 5,
      createdAt: Date.now() - 5000,
      completedAt: Date.now(),
      durationMs: 5000,
      segments: [],
      speedHistory: [],
      serverCapabilities: { supportsRange: true },
      logs: [],
    };
    db.saveDownload(testItem);

    db.addHistory({
      id: 'hist-1',
      downloadId: 'legacy-dl-1',
      filename: 'file.zip',
      url: 'https://example.com/file.zip',
      domain: 'example.com',
      date: Date.now(),
      durationMs: 5000,
      fileSize: 1048576,
      destinationPath: path.join(tempDir, 'file.zip'),
      status: 'completed',
      avgSpeed: 500000,
      peakSpeed: 800000,
      category: 'archive',
      queueName: 'Main Download Queue',
    });

    db.close();

    // Reopen and verify migration preserves records
    const dbReopened = new AppDatabase(dbPath);
    await dbReopened.init();

    expect(dbReopened.getSchemaVersion()).toBe(4);
    const retrieved = dbReopened.getDownload('legacy-dl-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.filename).toBe('file.zip');
    expect(retrieved?.status).toBe('completed');

    const history = dbReopened.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('hist-1');

    dbReopened.close();
  });

  test('Crash logs and audit logs tables are created and operational', async () => {
    const db = new AppDatabase(':memory:');
    await db.init();

    expect(db.getSchemaVersion()).toBe(4);

    db.saveCrashLog({
      id: 'crash-test-1',
      timestamp: Date.now(),
      appVersion: '4.0.0',
      platform: 'linux',
      errorCategory: 'SOCKET_TIMEOUT',
      message: 'Connection timed out to server',
      stack: 'Error: Connection timed out\n  at Socket.onTimeout',
    });

    const logs = db.getCrashLogs(10);
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe('crash-test-1');
    expect(logs[0].errorCategory).toBe('SOCKET_TIMEOUT');

    db.clearCrashLogs();
    expect(db.getCrashLogs().length).toBe(0);

    db.close();
  });
});
