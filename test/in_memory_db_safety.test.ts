import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadItem } from '../src/shared/types';

function createMockDownloadItem(id: string, url: string, filename: string): DownloadItem {
  return {
    id,
    url,
    filename,
    destinationDir: '/tmp',
    finalPath: `/tmp/${filename}`,
    tempPath: `/tmp/${filename}.part`,
    stateFilePath: `/tmp/${filename}.state`,
    status: 'queued',
    totalBytes: 1000,
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
    error: null,
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    durationMs: 0,
    securityScan: { status: 'unsupported' },
    serverCapabilities: { supportsRange: true, protocol: 'https', redirectChain: [], probedAt: Date.now(), authRequired: false },
    checksum: { algorithm: 'sha256', status: 'none' },
    logs: [],
    segments: [],
    speedHistory: [],
  };
}

describe('AppDatabase In-Memory Isolation and Safety', () => {
  const rootMemoryFile = path.join(process.cwd(), ':memory:');

  afterEach(() => {
    if (fs.existsSync(rootMemoryFile)) {
      fs.unlinkSync(rootMemoryFile);
    }
  });

  it('should not create a :memory: file on disk when using in-memory database', async () => {
    if (fs.existsSync(rootMemoryFile)) {
      fs.unlinkSync(rootMemoryFile);
    }

    const db = new AppDatabase(':memory:');
    await db.init();

    db.saveDownload(createMockDownloadItem('test-mem-1', 'https://example.com/file.zip', 'file.zip'));
    db.flush();
    db.close();

    // Verify no :memory: file was written to disk
    expect(fs.existsSync(rootMemoryFile)).toBe(false);
  });

  it('should isolate data between different in-memory database instances', async () => {
    const db1 = new AppDatabase(':memory:');
    await db1.init();

    const db2 = new AppDatabase(':memory:');
    await db2.init();

    db1.saveDownload(createMockDownloadItem('iso-1', 'https://example.com/iso1.zip', 'iso1.zip'));

    expect(db1.getDownload('iso-1')).not.toBeNull();
    expect(db2.getDownload('iso-1')).toBeNull();

    db1.close();
    db2.close();
  });
});
