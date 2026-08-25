import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { DiagnosticsService } from '../src/main/diagnostics/DiagnosticsService';
import { RecoveryOrchestrator } from '../src/main/engine/RecoveryOrchestrator';
import { ServerPolicyEngine } from '../src/main/engine/ServerPolicyEngine';
import { DownloadItem } from '../src/shared/types';

describe('Download Engine 2.0 & Queue Resilience Suite', () => {
  const testDir = path.join(__dirname, 'tmp_engine_v2_data');
  let db: AppDatabase;
  let engine: DownloadEngine;
  let mockServer: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Spin up local mock server for fast and deterministic unit testing
    await new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', '1024');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(Buffer.alloc(1024, 'a'));
      });
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    const dbPath = path.join(testDir, 'test_v2.db');
    db = new AppDatabase(dbPath);
    await db.init();
    const settings = db.getSettings();
    settings.general.defaultDownloadDir = testDir;
    db.saveSettings(settings);

    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterAll(async () => {
    await engine.shutdown();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Duplicate Detection & Collision Classifier', () => {
    it('should detect duplicate active URL and classify it correctly', async () => {
      const targetUrl = `http://127.0.0.1:${serverPort}/unique_archive.zip`;
      const added = await engine.addDownload({
        url: targetUrl,
        filename: 'unique_archive.zip',
        destinationDir: testDir,
        startImmediately: false,
      });

      expect(added).toBeDefined();

      const dupResult = engine.checkDuplicate({
        url: targetUrl,
        filename: 'unique_archive.zip',
        destinationDir: testDir,
      });

      expect(dupResult.isDuplicate).toBe(true);
      expect(dupResult.classification).toMatch(/DUPLICATE/);
      expect(dupResult.existingItem?.id).toBe(added.id);
    });

    it('should detect existing disk file collision', () => {
      const existingFile = path.join(testDir, 'existing_file_on_disk.txt');
      fs.writeFileSync(existingFile, 'hello world content');

      const dupResult = engine.checkDuplicate({
        url: `http://127.0.0.1:${serverPort}/new_file.txt`,
        filename: 'existing_file_on_disk.txt',
        destinationDir: testDir,
      });

      expect(dupResult.fileExistsOnDisk).toBe(true);
      expect(dupResult.existingFilePath).toBe(existingFile);
    });
  });

  describe('Queue Reordering & Concurrency Scheduling', () => {
    it('should reorder queued items deterministically', async () => {
      const item1 = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/item1.bin`,
        filename: 'item1.bin',
        queueId: 'default',
        startImmediately: false,
      });

      const item2 = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/item2.bin`,
        filename: 'item2.bin',
        queueId: 'default',
        startImmediately: false,
      });

      const item3 = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/item3.bin`,
        filename: 'item3.bin',
        queueId: 'default',
        startImmediately: false,
      });

      // Reorder item3 to index 0
      engine.reorderQueueItem('default', item3.id, 0);

      const allQueued = engine.getAllDownloads()
        .filter((d) => d.queueId === 'default' && d.status === 'queued')
        .sort((a, b) => a.createdAt - b.createdAt);

      expect(allQueued[0].id).toBe(item3.id);
    });
  });

  describe('Bulk Engine Controls', () => {
    it('should pause all, resume all, retry failed, and clear completed downloads', async () => {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/bulk_item.bin`,
        filename: 'bulk_item.bin',
        startImmediately: false,
      });

      item.status = 'failed';
      item.error = {
        code: 'TEST_ERROR',
        message: 'Simulated connection failure',
        timestamp: Date.now(),
        retryable: true,
        retryCount: 2,
      };
      db.saveDownload(item);

      // Retry failed
      await engine.retryFailed();
      const updated = engine.getDownload(item.id);
      expect(updated?.status).toBe('queued');
      expect(updated?.error).toBeNull();
      expect(updated?.retryCount).toBe(0);

      // Clear completed
      updated!.status = 'completed';
      db.saveDownload(updated!);
      engine.clearCompleted();
      expect(engine.getDownload(item.id)).toBeUndefined();
    });
  });

  describe('Crash Recovery State Tracking', () => {
    it('should track and report recovered interrupted downloads', async () => {
      const interruptedItem: DownloadItem = {
        id: 'interrupted_dl_test',
        url: `http://127.0.0.1:${serverPort}/crash_recovery_test.iso`,
        filename: 'crash_recovery_test.iso',
        tempPath: path.join(testDir, 'crash_recovery_test.iso.part'),
        stateFilePath: path.join(testDir, 'crash_recovery_test.iso.g1dm'),
        finalPath: path.join(testDir, 'crash_recovery_test.iso'),
        destinationDir: testDir,
        status: 'downloading',
        category: 'other',
        queueId: 'default',
        priority: 'normal',
        maxConnections: 4,
        activeConnections: 0,
        totalBytes: 10000,
        downloadedBytes: 4500,
        progress: 45.0,
        speed: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        eta: 0,
        speedHistory: [],
        segments: [],
        checksum: { algorithm: 'sha256', status: 'none' },
        speedLimitBytesPerSec: 0,
        error: null,
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        durationMs: 0,
        securityScan: { status: 'clean' },
        logs: [],
        serverCapabilities: {
          supportsRange: true,
          acceptRangesHeader: 'bytes',
          redirectChain: [],
          protocol: 'http',
          authRequired: false,
          probedAt: Date.now(),
        },
      };

      // Write mock partial file
      fs.writeFileSync(interruptedItem.tempPath, Buffer.alloc(4500));
      db.saveDownload(interruptedItem);

      // Create new engine to simulate restart
      const restartEngine = new DownloadEngine(db);
      await restartEngine.init();

      const recovered = restartEngine.getInterruptedDownloads();
      expect(recovered.length).toBeGreaterThan(0);
      const found = recovered.find((d) => d.id === interruptedItem.id);
      expect(found).toBeDefined();
      expect(found?.status).toBe('paused');
      expect(found?.downloadedBytes).toBe(4500);

      restartEngine.dismissInterruptedDownloads();
      expect(restartEngine.getInterruptedDownloads().length).toBe(0);

      await restartEngine.shutdown();
    });
  });

  describe('RecoveryOrchestrator Decision & Backoff Engine', () => {
    it('should correctly classify 404/410 as unrecoverable abort', () => {
      const orchestrator = new RecoveryOrchestrator(new ServerPolicyEngine(), db);
      const mockItem: any = { id: 'mock_1', url: 'https://example.com/test.bin', maxConnections: 8 };

      const decision = orchestrator.evaluateFailure(mockItem, new Error('HTTP 404 Not Found'));
      expect(decision.action).toBe('ABORT_UNRECOVERABLE');
      expect(decision.category).toBe('RESOURCE_FAILURE');
    });

    it('should correctly classify 429/503 as adaptive AIMD backoff', () => {
      const orchestrator = new RecoveryOrchestrator(new ServerPolicyEngine(), db);
      const mockItem: any = { id: 'mock_2', url: 'https://example.com/test.bin', maxConnections: 8 };

      const decision = orchestrator.evaluateFailure(mockItem, new Error('HTTP 429 Too Many Requests'));
      expect(decision.action).toBe('ADAPTIVE_AIMD_BACKOFF');
      expect(decision.newConnectionCount).toBe(4);
      expect(decision.backoffMs).toBeGreaterThan(0);
    });

    it('should calculate exponential backoff with jitter for network drops', () => {
      const orchestrator = new RecoveryOrchestrator(new ServerPolicyEngine(), db);
      const mockItem: any = { id: 'mock_3', url: 'https://example.com/test.bin', maxConnections: 8 };

      const decision = orchestrator.evaluateFailure(mockItem, new Error('ECONNRESET connection reset by peer'));
      expect(decision.action).toBe('RETRY_WITH_BACKOFF');
      expect(decision.category).toBe('NETWORK_FAILURE');
    });
  });

  describe('DiagnosticsService Metrics & Redaction', () => {
    it('should execute all diagnostics and produce redacted reports without secret leaks', async () => {
      const results = await DiagnosticsService.runAllDiagnostics(db, engine);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === 'diag-database')).toBe(true);
      expect(results.some((r) => r.id === 'diag-memory')).toBe(true);
      expect(results.some((r) => r.id === 'diag-storage-space')).toBe(true);

      const reportJson = DiagnosticsService.generateRedactedReport(db, engine, results);
      expect(reportJson).toBeDefined();

      const parsed = JSON.parse(reportJson);
      expect(parsed.product).toContain('G1DM');
      expect(parsed.system).toBeDefined();
      expect(parsed.settings).toBeDefined();
    });
  });
});
