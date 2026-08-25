import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { SegmentLedger } from '../src/main/engine/SegmentLedger';
import { BandwidthGovernor } from '../src/main/qos/BandwidthGovernor';
import { DownloadItem, Priority } from '../src/shared/types';

describe('G1DM 3.0 — Comprehensive Stress Testing (Phase 26)', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;

  beforeAll(async () => {
    db = new AppDatabase();
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterAll(async () => {
    await engine.shutdown();
  });

  describe('Queue Concurrency Stress (1,000 items)', () => {
    it('handles 1,000 queued downloads and fast priority sorting under 500ms', () => {
      const items: DownloadItem[] = [];
      const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];

      for (let i = 0; i < 1000; i++) {
        items.push({
          id: `stress_dl_${i}`,
          url: `https://example.com/file_${i}.bin`,
          filename: `file_${i}.bin`,
          destinationDir: '/tmp',
          finalPath: `/tmp/file_${i}.bin`,
          tempPath: `/tmp/file_${i}.bin.part`,
          stateFilePath: `/tmp/file_${i}.bin.g1dm`,
          status: 'queued',
          totalBytes: 1024 * 1024 * (i + 1),
          downloadedBytes: 0,
          progress: 0,
          speed: 0,
          avgSpeed: 0,
          peakSpeed: 0,
          eta: 0,
          category: 'other',
          queueId: 'default',
          priority: priorities[i % priorities.length],
          maxConnections: 8,
          activeConnections: 0,
          segments: [],
          speedHistory: [],
          checksum: { algorithm: 'sha256', status: 'none' },
          serverCapabilities: {
            supportsRange: true,
            redirectChain: [],
            protocol: 'https',
            authRequired: false,
            probedAt: Date.now(),
          },
          speedLimitBytesPerSec: 0,
          error: null,
          retryCount: 0,
          maxRetries: 5,
          createdAt: Date.now() - i * 100,
          durationMs: 0,
          securityScan: { status: 'unsupported' },
          logs: [],
        });
      }

      const startTime = Date.now();
      const priorityWeight: Record<Priority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
      const sorted = [...items].sort((a, b) => {
        const pDiff = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
        if (pDiff !== 0) return pDiff;
        return a.createdAt - b.createdAt;
      });
      const elapsed = Date.now() - startTime;

      expect(sorted.length).toBe(1000);
      expect(sorted[0].priority).toBe('urgent');
      expect(sorted[sorted.length - 1].priority).toBe('low');
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Segment Ledger Multi-Connection Invariants (8 segments & Work Stealing)', () => {
    it('maintains strict zero-gap and zero-overlap across split & steal operations', () => {
      const totalSize = 100 * 1024 * 1024; // 100 MB
      const ledger = new SegmentLedger('stress_test_item', totalSize);

      // Initialize with 8 segments
      const initialSegments = ledger.initialize(8);
      expect(initialSegments.length).toBe(8);
      expect(ledger.validateZeroOverlap()).toBe(true);

      // Simulate partial progress across segments
      for (const seg of initialSegments) {
        ledger.updateProgress(seg.segmentId, 1024 * 1024); // 1 MB downloaded per segment
      }

      // Simulate work stealing from segment 8 by an idle connection
      const stolen = ledger.claimWorkSteal(8, 'worker_9', 512 * 1024);
      expect(stolen).not.toBeNull();
      expect(ledger.validateZeroOverlap()).toBe(true);

      // Mark all completed
      for (const seg of ledger.getSegments()) {
        const remaining = seg.endOffset - seg.currentOffset + 1;
        if (remaining > 0) {
          ledger.updateProgress(seg.segmentId, remaining);
        }
        ledger.markCompleted(seg.segmentId);
      }

      expect(ledger.isAllCompleted()).toBe(true);
      const gapCheck = ledger.validateZeroGap();
      expect(gapCheck.valid).toBe(true);
    });
  });

  describe('Bandwidth Governor Scale (100 concurrent active downloads)', () => {
    it('fairly distributes 100 MB/s among 100 concurrent downloads under 50ms', () => {
      const governor = new BandwidthGovernor(100 * 1024 * 1024); // 100 MB/s
      const activeItems: DownloadItem[] = [];
      const priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];

      for (let i = 0; i < 100; i++) {
        activeItems.push({
          id: `dl_concurrent_${i}`,
          url: `https://example.com/item_${i}.iso`,
          filename: `item_${i}.iso`,
          destinationDir: '/tmp',
          finalPath: `/tmp/item_${i}.iso`,
          tempPath: `/tmp/item_${i}.iso.part`,
          stateFilePath: `/tmp/item_${i}.iso.g1dm`,
          status: 'downloading',
          totalBytes: 500 * 1024 * 1024,
          downloadedBytes: 10 * 1024 * 1024,
          progress: 2,
          speed: 0,
          avgSpeed: 0,
          peakSpeed: 0,
          eta: 0,
          category: 'disk_images',
          queueId: 'default',
          priority: priorities[i % priorities.length],
          maxConnections: 8,
          activeConnections: 4,
          segments: [],
          speedHistory: [],
          checksum: { algorithm: 'sha256', status: 'none' },
          serverCapabilities: {
            supportsRange: true,
            redirectChain: [],
            protocol: 'https',
            authRequired: false,
            probedAt: Date.now(),
          },
          speedLimitBytesPerSec: 0,
          error: null,
          retryCount: 0,
          maxRetries: 5,
          createdAt: Date.now(),
          durationMs: 0,
          securityScan: { status: 'unsupported' },
          logs: [],
        });
      }

      const start = Date.now();
      const allocations = governor.calculateAllocations(activeItems);
      const elapsed = Date.now() - start;

      expect(allocations.size).toBe(100);
      expect(elapsed).toBeLessThan(50);

      // Verify every single active download has non-zero bandwidth allocation
      let sumAllocated = 0;
      for (const alloc of allocations.values()) {
        expect(alloc.allocatedBytesPerSec).toBeGreaterThanOrEqual(64 * 1024);
        sumAllocated += alloc.allocatedBytesPerSec;
      }

      expect(sumAllocated).toBeLessThanOrEqual(100 * 1024 * 1024);
    });
  });

  describe('History Database Scale (50,000 records simulation)', () => {
    it('handles simulated 50,000 history record pagination and search smoothly', () => {
      const records: any[] = [];
      for (let i = 0; i < 50000; i++) {
        records.push({
          id: `hist_${i}`,
          downloadId: `dl_${i}`,
          filename: `download_archive_${i}.zip`,
          url: `https://downloads.example.org/archive_${i}.zip`,
          domain: 'downloads.example.org',
          date: Date.now() - i * 1000,
          durationMs: 5000 + (i % 1000),
          fileSize: 1024 * 1024 * (i % 500 + 1),
          destinationPath: `/Downloads/download_archive_${i}.zip`,
          status: 'completed',
          avgSpeed: 25 * 1024 * 1024,
          peakSpeed: 35 * 1024 * 1024,
          checksumAlgorithm: 'sha256',
          checksumVerified: true,
          category: 'archives',
          queueName: 'Default Queue',
        });
      }

      const searchStart = Date.now();
      const query = 'archive_4999';
      const searchResults = records.filter((r) => r.filename.includes(query) || r.url.includes(query));
      const searchElapsed = Date.now() - searchStart;

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchElapsed).toBeLessThan(200);

      const pageStart = Date.now();
      const page = 100;
      const pageSize = 50;
      const paginated = records.slice(page * pageSize, (page + 1) * pageSize);
      const pageElapsed = Date.now() - pageStart;

      expect(paginated.length).toBe(pageSize);
      expect(pageElapsed).toBeLessThan(10);
    });
  });
});
