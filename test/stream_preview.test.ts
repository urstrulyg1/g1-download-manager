import * as fs from 'fs';
import * as path from 'path';
import { StreamPreviewService } from '../src/main/engine/StreamPreviewService';
import { AppDatabase } from '../src/main/db/Database';

describe('StreamPreviewService Suite', () => {
  const testDir = path.join(process.cwd(), 'temp_test_stream');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return preview status for a valid video download', async () => {
    const testFile = path.join(testDir, 'sample_video.mp4');
    // Create a 512KB mock video file
    fs.writeFileSync(testFile, Buffer.alloc(512 * 1024, 0xAA));

    const db = new AppDatabase();
    await db.init();
    const downloadId = 'test_stream_dl_1';
    db.saveDownload({
      id: downloadId,
      url: 'https://example.com/video.mp4',
      filename: 'sample_video.mp4',
      destinationDir: testDir,
      finalPath: testFile,
      tempPath: `${testFile}.g1dm.part`,
      stateFilePath: `${testFile}.g1dm.state`,
      totalBytes: 512 * 1024,
      downloadedBytes: 512 * 1024,
      status: 'completed',
      category: 'video',
      queueId: 'default',
      priority: 'normal',
      progress: 100,
      speed: 0,
      avgSpeed: 1024,
      peakSpeed: 2048,
      eta: 0,
      createdAt: Date.now(),
      completedAt: Date.now(),
      maxConnections: 4,
      activeConnections: 0,
      segments: [],
      speedHistory: [],
      checksum: { algorithm: 'sha256', status: 'none' },
      serverCapabilities: { supportsRange: true, protocol: 'http', redirectChain: [], authRequired: false, probedAt: Date.now() },
      speedLimitBytesPerSec: 0,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      durationMs: 1000,
      securityScan: { status: 'clean' },
      logs: [],
    });

    const status = StreamPreviewService.getPreviewStatus(downloadId, db);
    expect(status.canPreview).toBe(true);
    expect(status.availableBytes).toBe(512 * 1024);
    expect(status.mimeType).toBe('video/mp4');
    expect(status.isComplete).toBe(true);
  });

  it('should detect non-ready preview when file is too small or missing', () => {
    const status = StreamPreviewService.getPreviewStatus('non_existent_id');
    expect(status.canPreview).toBe(false);
    expect(status.availableBytes).toBe(0);
  });
});
