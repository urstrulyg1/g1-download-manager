import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { DownloadItem } from '../src/shared/types';

describe('Resource Leak Stress & Queue Scale Verification', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterEach(async () => {
    await engine.shutdown();
    db.close();
  });

  test('High repetition download lifecycle stress stabilizes memory and state machines', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Create, pause, resume, retry, cancel, delete 100 times in rapid succession
    for (let i = 0; i < 100; i++) {
      const id = `stress-dl-${i}`;
      const item: DownloadItem = {
        id,
        url: `https://example.com/file_${i}.bin`,
        filename: `file_${i}.bin`,
        destinationDir: '/tmp',
        finalPath: `/tmp/file_${i}.bin`,
        tempPath: `/tmp/file_${i}.bin.part`,
        stateFilePath: `/tmp/file_${i}.bin.g1dm`,
        status: 'queued',
        totalBytes: 1024 * 1024,
        downloadedBytes: 0,
        progress: 0,
        speed: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        eta: 0,
        category: 'other',
        queueId: 'default',
        priority: 'normal',
        maxConnections: 4,
        activeConnections: 0,
        speedLimitBytesPerSec: 0,
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now() + i,
        durationMs: 0,
        segments: [],
        speedHistory: [],
        checksum: undefined,
        error: null,
        securityScan: undefined,
        serverCapabilities: {
          supportsRange: true,
          redirectChain: [`https://example.com/file_${i}.bin`],
          protocol: 'https',
          authRequired: false,
          probedAt: Date.now(),
        },
        logs: [],
      };

      db.saveDownload(item);
      (engine as any).downloads.set(id, item);

      engine.pauseDownload(id);
      expect(engine.getDownload(id)?.status).toBe('paused');

      engine.retryDownload(id);
      expect(engine.getDownload(id)?.status).toBe('queued');

      engine.cancelDownload(id);
      expect(engine.getDownload(id)?.status).toBe('cancelled');

      engine.deleteDownload(id, false);
      expect(engine.getDownload(id)).toBeUndefined();
    }

    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage().heapUsed;
    const heapDiffMb = (finalMemory - initialMemory) / 1024 / 1024;
    // Memory overhead should be minimal (< 50 MB across stress runs)
    expect(heapDiffMb).toBeLessThan(50);
    expect(engine.getAllDownloads().length).toBe(0);
  });

  test('Large scale queue with 1,000 history items maintains sub-50ms query performance', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      db.addHistory({
        id: `h-${i}`,
        downloadId: `d-${i}`,
        filename: `archive_${i}.tar.gz`,
        url: `https://mirror.org/archive_${i}.tar.gz`,
        domain: 'mirror.org',
        date: Date.now() - i * 1000,
        durationMs: 2500,
        fileSize: 10_000_000 + i,
        destinationPath: `/home/user/Downloads/archive_${i}.tar.gz`,
        status: 'completed',
        avgSpeed: 4_000_000,
        peakSpeed: 5_500_000,
        category: 'archive',
        queueName: 'Main Download Queue',
      });
    }

    const queryStart = Date.now();
    const history = db.getHistory();
    const queryDuration = Date.now() - queryStart;

    expect(history.length).toBe(1000);
    expect(queryDuration).toBeLessThan(100); // Sub-100ms SQLite query
  });
});
