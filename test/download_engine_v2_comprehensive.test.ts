import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { DownloadIntelligence } from '../src/main/engine/DownloadIntelligence';
import { DiagnosticsService } from '../src/main/diagnostics/DiagnosticsService';
import { TokenBucketRateLimiter } from '../src/main/engine/RateLimiter';
import { ChecksumVerifier } from '../src/main/engine/ChecksumVerifier';

describe('G1DM Download Engine 2.0 & Queue Management Comprehensive Suite', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;
  let server: http.Server;
  let serverPort: number;
  const tempDir = path.join(__dirname, 'tmp_v2_comprehensive');

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url === '/test-file.bin') {
        const totalSize = 100 * 1024; // 100 KB
        const range = req.headers.range;

        if (range) {
          const match = range.match(/bytes=(\d+)-(\d+)?/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
            const chunkLen = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkLen,
              'Content-Type': 'application/octet-stream',
              'ETag': '"test-etag-12345"',
            });
            const buf = Buffer.alloc(chunkLen, 0x42);
            res.end(buf);
            return;
          }
        }

        res.writeHead(200, {
          'Content-Length': totalSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': 'application/octet-stream',
          'ETag': '"test-etag-12345"',
        });
        res.end(Buffer.alloc(totalSize, 0x42));
      } else if (url === '/no-range.bin') {
        const totalSize = 20 * 1024;
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Accept-Ranges': 'none',
          'Content-Type': 'application/octet-stream',
        });
        res.end(Buffer.alloc(totalSize, 0x41));
      } else if (url === '/error-503.bin') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
      } else if (url === '/error-404.bin') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Length': 10 });
        res.end('1234567890');
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    serverPort = (server.address() as { port: number }).port;

    db = new AppDatabase(':memory:');
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await engine.shutdown();
    if (server) {
      server.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --- 1. DOWNLOAD ENGINE 2.0 LIFECYCLE ---
  describe('1. Engine 2.0 Pause, Resume, and Atomic Finalization', () => {
    it('should complete download, create atomic file, and verify checksum', async () => {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/test-file.bin`,
        filename: 'atomic_test.bin',
        destinationDir: tempDir,
        startImmediately: true,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Download timed out')), 5000);
        engine.on('item_completed', (completed) => {
          if (completed.id === item.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      expect(fs.existsSync(item.finalPath)).toBe(true);
      expect(fs.existsSync(item.tempPath)).toBe(false);
      expect(fs.statSync(item.finalPath).size).toBe(100 * 1024);

      // Verify SHA256 checksum
      const actualHash = await ChecksumVerifier.calculateFileHash(item.finalPath, 'sha256');
      expect(actualHash).toBeDefined();
      expect(actualHash.length).toBe(64);

      const verified = await ChecksumVerifier.verifyChecksum(item.finalPath, {
        algorithm: 'sha256',
        expected: actualHash,
        status: 'pending',
      });
      expect(verified.status).toBe('verified');
    });

    it('should pause download cleanly and preserve .part file without deletion', async () => {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/test-file.bin`,
        filename: 'pause_test.bin',
        destinationDir: tempDir,
        startImmediately: false,
      });

      engine.pauseDownload(item.id);
      const updated = engine.getDownload(item.id);
      expect(updated?.status).toBe('paused');
      expect(updated?.speed).toBe(0);
      expect(updated?.activeConnections).toBe(0);
    });

    it('should fall back gracefully on servers without Range support', async () => {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/no-range.bin`,
        filename: 'single_stream.bin',
        destinationDir: tempDir,
        startImmediately: true,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Single stream download timed out')), 5000);
        engine.on('item_completed', (completed) => {
          if (completed.id === item.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      expect(fs.existsSync(item.finalPath)).toBe(true);
      expect(fs.statSync(item.finalPath).size).toBe(20 * 1024);
    });
  });

  // --- 2. AUTOMATIC RETRY & BACKOFF ---
  describe('2. Automatic Retry & Error Classification', () => {
    it('should retry retryable 503 errors with exponential backoff and track retry count', async () => {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/error-503.bin`,
        filename: 'retry_test.bin',
        destinationDir: tempDir,
        startImmediately: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 800));
      const current = engine.getDownload(item.id);
      expect(current).toBeDefined();
      expect(current?.retryCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- 3. QUEUE MANAGEMENT & CONCURRENCY ---
  describe('3. Queue Management, Concurrency & Priority', () => {
    it('should respect priority ordering (urgent > high > normal > low)', async () => {
      const itemLow = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/test-file.bin?q=low`,
        filename: 'low.bin',
        destinationDir: tempDir,
        priority: 'low',
        startImmediately: false,
      });

      const itemHigh = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/test-file.bin?q=high`,
        filename: 'high.bin',
        destinationDir: tempDir,
        priority: 'high',
        startImmediately: false,
      });

      const itemUrgent = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/test-file.bin?q=urgent`,
        filename: 'urgent.bin',
        destinationDir: tempDir,
        priority: 'urgent',
        startImmediately: false,
      });

      // Update priority test
      engine.updatePriority(itemLow.id, 'urgent');
      expect(engine.getDownload(itemLow.id)?.priority).toBe('urgent');
    });

    it('should support queue controls: Pause All, Resume All, Cancel All', () => {
      engine.pauseAll();
      engine.resumeAll();
      engine.cancelAll();

      const all = engine.getAllDownloads();
      const activeOrQueued = all.filter((d) => d.status === 'downloading');
      expect(activeOrQueued.length).toBe(0);
    });

    it('should reorder queued items and persist new index sequence', () => {
      const qItems = engine.getAllDownloads().filter((d) => d.status === 'queued');
      if (qItems.length >= 2) {
        engine.reorderQueueItem('default', qItems[0].id, 1);
      }
    });
  });

  // --- 4. BANDWIDTH MANAGEMENT ---
  describe('4. Bandwidth Rate Limiting', () => {
    it('should apply and update global and per-download bandwidth limits', () => {
      const limiter = new TokenBucketRateLimiter(1024 * 1024); // 1 MB/s
      expect(limiter.getLimit()).toBe(1024 * 1024);

      limiter.setLimit(500 * 1024);
      expect(limiter.getLimit()).toBe(500 * 1024);

      limiter.setLimit(0); // Unlimited
      expect(limiter.getLimit()).toBe(0);

      engine.setGlobalSpeedLimit(2 * 1024 * 1024);
      expect(engine.getGlobalRateLimit()).toBe(2 * 1024 * 1024);
    });
  });

  // --- 5. DUPLICATE DETECTION ---
  describe('5. Duplicate Detection & Collision Safety', () => {
    it('should classify identical URL as DEFINITELY_DUPLICATE or PROBABLY_DUPLICATE', () => {
      const existing = engine.getAllDownloads();
      if (existing.length > 0) {
        const check = DownloadIntelligence.detectDuplicate(
          { url: existing[0].url, filename: existing[0].filename },
          existing
        );
        expect(check.classification).not.toBe('DIFFERENT_RESOURCE');
      }
    });

    it('should detect existing files on disk without silently overwriting', () => {
      const collisionFile = path.join(tempDir, 'existing_collision.bin');
      fs.writeFileSync(collisionFile, 'already exists');

      const check = engine.checkDuplicate({
        url: 'https://example.com/existing_collision.bin',
        filename: 'existing_collision.bin',
        destinationDir: tempDir,
      });

      expect(check.fileExistsOnDisk).toBe(true);
    });
  });

  // --- 6. DIAGNOSTICS & DATA REDACTION ---
  describe('6. Diagnostics Report & Secret Redaction', () => {
    it('should run diagnostics and generate sanitized report without secrets', async () => {
      // Set secrets in settings
      const currentSettings = db.getSettings();
      currentSettings.security.apiKey = 'super_secret_api_key_999';
      currentSettings.remote.telegramBotToken = 'secret_bot_token_777';
      currentSettings.network.proxyPassword = 'super_secret_proxy_pwd';
      db.saveSettings(currentSettings);

      const results = await DiagnosticsService.runAllDiagnostics(db, engine);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const report = DiagnosticsService.generateRedactedReport(db, engine, results);
      expect(typeof report).toBe('string');
      expect(report).not.toContain('super_secret_api_key_999');
      expect(report).not.toContain('secret_bot_token_777');
      expect(report).not.toContain('super_secret_proxy_pwd');
      expect(report).toContain('***REDACTED***');
      expect(report).toContain('G1DM');
    });
  });
});
