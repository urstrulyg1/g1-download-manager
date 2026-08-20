import { UndoManager } from '../src/main/engine/UndoManager';
import { AppDatabase } from '../src/main/db/Database';
import * as path from 'path';
import * as fs from 'fs';

describe('Safe Undo System Suite', () => {
  const testDir = path.join(__dirname, 'tmp_undo_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should record destructive delete actions and restore items upon undo', async () => {
    const db = new AppDatabase(path.join(testDir, 'undo.db'));
    await db.init();

    const undoMgr = new UndoManager(db);

    const mockItem: any = {
      id: 'dl_undo_item_1',
      url: 'https://example.com/archive.zip',
      filename: 'archive.zip',
      destinationDir: testDir,
      finalPath: path.join(testDir, 'archive.zip'),
      tempPath: path.join(testDir, 'archive.zip.part'),
      stateFilePath: path.join(testDir, 'archive.zip.g1dm'),
      status: 'queued',
      totalBytes: 1048576,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'archive',
      queueId: 'default',
      priority: 'normal',
      maxConnections: 8,
      activeConnections: 0,
      speedLimitBytesPerSec: 0,
      error: null,
      retryCount: 0,
      maxRetries: 5,
      createdAt: Date.now(),
      durationMs: 0,
      securityScan: { status: 'unsupported' },
      serverCapabilities: { supportsRange: true, protocol: 'https', redirectChain: [], probedAt: Date.now() },
      checksum: { algorithm: 'sha256', status: 'none' },
      logs: [],
      segments: [],
      speedHistory: [],
    };

    // Save item then simulate delete with Undo recording
    db.saveDownload(mockItem);
    expect(db.getDownload('dl_undo_item_1')).not.toBeNull();

    undoMgr.recordAction({
      type: 'DELETE_DOWNLOAD',
      description: 'Delete download archive.zip',
      items: [mockItem],
    });

    db.deleteDownload('dl_undo_item_1');
    expect(db.getDownload('dl_undo_item_1')).toBeNull();

    // Trigger Undo
    const undoRes = await undoMgr.undoLastAction();
    expect(undoRes.success).toBe(true);
    expect(undoRes.restoredCount).toBe(1);

    // Verify item is restored in DB
    const restored = db.getDownload('dl_undo_item_1');
    expect(restored).not.toBeNull();
    expect(restored?.filename).toBe('archive.zip');

    db.close();
  });
});
