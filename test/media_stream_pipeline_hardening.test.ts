import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { BinaryLocator } from '../src/main/platform/BinaryLocator';
import { HttpDownloader } from '../src/main/engine/HttpDownloader';
import { ProbeService } from '../src/main/engine/ProbeService';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadItem } from '../src/shared/types';

describe('Media Stream Pipeline & Download Hardening Tests', () => {
  let testDir: string;
  let server: http.Server;
  let serverPort: number;
  let errorCount = 0;

  beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm_hardening_test_'));

    // Mock HTTP server that returns 403 with 31 bytes on /403-stream, and valid media on /valid
    server = http.createServer((req, res) => {
      if (req.url?.includes('/403-stream')) {
        errorCount++;
        res.writeHead(403, {
          'Content-Type': 'text/html; charset=UTF-8',
          'Content-Length': '31',
        });
        res.end('<html><title>Error</title></html>');
      } else if (req.url?.includes('/valid-file')) {
        const payload = Buffer.alloc(10000, 0x42);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': '10000',
        });
        res.end(payload);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll((done) => {
    server.close(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
      done();
    });
  });

  test('1. BinaryLocator resolves paths and detects tool availability', async () => {
    BinaryLocator.ensurePath();
    const ytDlp = BinaryLocator.getYtDlpPath();
    const ffmpeg = BinaryLocator.getFfmpegPath();
    const ffmpegDir = BinaryLocator.getFfmpegDir();

    expect(typeof ytDlp).toBe('string');
    expect(typeof ffmpeg).toBe('string');
    expect(ytDlp.length).toBeGreaterThan(0);
    expect(ffmpeg.length).toBeGreaterThan(0);

    const isYt = await BinaryLocator.isYtDlpAvailable();
    const isFf = await BinaryLocator.isFfmpegAvailable();
    expect(typeof isYt).toBe('boolean');
    expect(typeof isFf).toBe('boolean');
  });

  test('2. ProbeService throws descriptive error on HTTP 403 instead of accepting 31 bytes', async () => {
    const testUrl = `http://127.0.0.1:${serverPort}/403-stream`;
    await expect(ProbeService.probe(testUrl)).rejects.toThrow(/Server returned HTTP 403/);
  });

  test('3. HttpDownloader rejects single-stream error response and does not accumulate corrupted bytes on retries', async () => {
    const errorUrl = `http://127.0.0.1:${serverPort}/403-stream`;
    const finalPath = path.join(testDir, 'test_error_video.mp4');
    const tempPath = `${finalPath}.part`;
    const stateFilePath = `${finalPath}.g1dm`;

    const item: DownloadItem = {
      id: 'test_dl_error_accum',
      url: errorUrl,
      filename: 'test_error_video.mp4',
      destinationDir: testDir,
      finalPath,
      tempPath,
      stateFilePath,
      status: 'downloading',
      totalBytes: -1,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'video',
      queueId: 'default',
      priority: 'normal',
      maxConnections: 1,
      activeConnections: 0,
      segments: [],
      speedHistory: [],
      checksum: { algorithm: 'sha256', status: 'none' },
      serverCapabilities: {
        supportsRange: false,
        redirectChain: [errorUrl],
        protocol: 'http',
        authRequired: false,
        probedAt: Date.now(),
      },
      speedLimitBytesPerSec: 0,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      durationMs: 0,
      securityScan: { status: 'unsupported' },
      safetyWarning: undefined,
      logs: [],
    };

    const downloader = new HttpDownloader(item);
    let errorCaught = false;

    downloader.on('error', (err) => {
      errorCaught = true;
    });

    await downloader.start();

    // Verify it failed rather than completing
    expect(errorCaught).toBe(true);
    expect(item.status).toBe('failed');
    expect(item.error?.message).toMatch(/HTTP 403/);

    // Verify temp file does not contain leftover accumulated payload
    if (fs.existsSync(tempPath)) {
      const stat = fs.statSync(tempPath);
      expect(stat.size).toBe(0);
    }
  });

  test('4. HttpDownloader finalizeCompletion strictly blocks small HTML error payloads from completing as media', async () => {
    const finalPath = path.join(testDir, 'fake_error.mp4');
    const tempPath = `${finalPath}.part`;
    const stateFilePath = `${finalPath}.g1dm`;

    // Write a fake 124-byte error file
    fs.writeFileSync(tempPath, '<html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1>Access denied to stream.</body></html>');

    const item: DownloadItem = {
      id: 'test_dl_false_complete',
      url: 'http://example.com/stream.mp4',
      filename: 'fake_error.mp4',
      destinationDir: testDir,
      finalPath,
      tempPath,
      stateFilePath,
      status: 'downloading',
      totalBytes: -1,
      downloadedBytes: 124,
      progress: 100,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'video',
      queueId: 'default',
      priority: 'normal',
      maxConnections: 1,
      activeConnections: 0,
      segments: [],
      speedHistory: [],
      checksum: { algorithm: 'sha256', status: 'none' },
      serverCapabilities: {
        supportsRange: false,
        redirectChain: [],
        protocol: 'http',
        authRequired: false,
        probedAt: Date.now(),
      },
      speedLimitBytesPerSec: 0,
      error: null,
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      durationMs: 0,
      securityScan: { status: 'unsupported' },
      safetyWarning: undefined,
      logs: [],
    };

    const downloader = new HttpDownloader(item);
    let errorEmitted = false;
    let completedEmitted = false;

    downloader.on('error', () => { errorEmitted = true; });
    downloader.on('completed', () => { completedEmitted = true; });

    // Directly trigger finalizeCompletion (which is private)
    (downloader as any).finalizeCompletion();

    expect(completedEmitted).toBe(false);
    expect(errorEmitted).toBe(true);
    expect(item.status).toBe('failed');
    expect(fs.existsSync(finalPath)).toBe(false);
  });
});
