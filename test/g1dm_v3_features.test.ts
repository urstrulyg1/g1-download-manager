import { BandwidthGovernor } from '../src/main/qos/BandwidthGovernor';
import { NetworkIntelligence } from '../src/main/network/NetworkIntelligence';
import { BackupService } from '../src/main/backup/BackupService';
import { RuleEngine } from '../src/main/automation/RuleEngine';
import { SchedulerService } from '../src/main/scheduler/SchedulerService';
import { ChecksumVerifier } from '../src/main/engine/ChecksumVerifier';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { DownloadItem, Priority } from '../src/shared/types';
import * as fs from 'fs';
import * as path from 'path';

describe('G1DM 3.0 — Advanced Feature Verification', () => {
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

  describe('Bandwidth Governor (Phase 4)', () => {
    it('allocates bandwidth with priority weighting and starvation protection', () => {
      const governor = new BandwidthGovernor(10 * 1024 * 1024); // 10 MB/s total
      const items: DownloadItem[] = [
        {
          id: 'dl_urgent',
          url: 'https://example.com/1',
          filename: '1.zip',
          destinationDir: '/tmp',
          finalPath: '/tmp/1.zip',
          tempPath: '/tmp/1.zip.part',
          stateFilePath: '/tmp/1.zip.g1dm',
          status: 'downloading',
          totalBytes: 1000,
          downloadedBytes: 0,
          progress: 0,
          speed: 0,
          avgSpeed: 0,
          peakSpeed: 0,
          eta: 0,
          category: 'other',
          queueId: 'default',
          priority: 'urgent',
          maxConnections: 8,
          activeConnections: 1,
          segments: [],
          speedHistory: [],
          checksum: { algorithm: 'sha256', status: 'none' },
          serverCapabilities: { supportsRange: true, redirectChain: [], protocol: 'https', authRequired: false, probedAt: Date.now() },
          speedLimitBytesPerSec: 0,
          error: null,
          retryCount: 0,
          maxRetries: 5,
          createdAt: Date.now(),
          durationMs: 0,
          securityScan: { status: 'unsupported' },
          logs: [],
        },
        {
          id: 'dl_low',
          url: 'https://example.com/2',
          filename: '2.zip',
          destinationDir: '/tmp',
          finalPath: '/tmp/2.zip',
          tempPath: '/tmp/2.zip.part',
          stateFilePath: '/tmp/2.zip.g1dm',
          status: 'downloading',
          totalBytes: 1000,
          downloadedBytes: 0,
          progress: 0,
          speed: 0,
          avgSpeed: 0,
          peakSpeed: 0,
          eta: 0,
          category: 'other',
          queueId: 'default',
          priority: 'low',
          maxConnections: 8,
          activeConnections: 1,
          segments: [],
          speedHistory: [],
          checksum: { algorithm: 'sha256', status: 'none' },
          serverCapabilities: { supportsRange: true, redirectChain: [], protocol: 'https', authRequired: false, probedAt: Date.now() },
          speedLimitBytesPerSec: 0,
          error: null,
          retryCount: 0,
          maxRetries: 5,
          createdAt: Date.now(),
          durationMs: 0,
          securityScan: { status: 'unsupported' },
          logs: [],
        },
      ];

      const allocations = governor.calculateAllocations(items);
      expect(allocations.size).toBe(2);

      const urgentAlloc = allocations.get('dl_urgent');
      const lowAlloc = allocations.get('dl_low');

      expect(urgentAlloc).toBeDefined();
      expect(lowAlloc).toBeDefined();
      expect(urgentAlloc!.allocatedBytesPerSec).toBeGreaterThan(lowAlloc!.allocatedBytesPerSec);
      // Ensure low priority receives at least the minimum starvation floor
      expect(lowAlloc!.allocatedBytesPerSec).toBeGreaterThanOrEqual(64 * 1024);
      // Total allocated should not exceed global budget
      expect(urgentAlloc!.allocatedBytesPerSec + lowAlloc!.allocatedBytesPerSec).toBeLessThanOrEqual(10 * 1024 * 1024);
    });

    it('handles unlimited mode (0 bytes/s) correctly', () => {
      const governor = new BandwidthGovernor(0);
      const items: DownloadItem[] = [
        {
          id: 'dl_unlimited',
          url: 'https://example.com/1',
          filename: '1.zip',
          destinationDir: '/tmp',
          finalPath: '/tmp/1.zip',
          tempPath: '/tmp/1.zip.part',
          stateFilePath: '/tmp/1.zip.g1dm',
          status: 'downloading',
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
          maxConnections: 8,
          activeConnections: 1,
          segments: [],
          speedHistory: [],
          checksum: { algorithm: 'sha256', status: 'none' },
          serverCapabilities: { supportsRange: true, redirectChain: [], protocol: 'https', authRequired: false, probedAt: Date.now() },
          speedLimitBytesPerSec: 5000,
          error: null,
          retryCount: 0,
          maxRetries: 5,
          createdAt: Date.now(),
          durationMs: 0,
          securityScan: { status: 'unsupported' },
          logs: [],
        },
      ];

      const allocations = governor.calculateAllocations(items);
      expect(allocations.get('dl_unlimited')?.allocatedBytesPerSec).toBe(5000);
    });
  });

  describe('Network Intelligence (Phases 11 & 12)', () => {
    it('initializes and provides network quality metrics', () => {
      const netIntel = new NetworkIntelligence(10000);
      const status = netIntel.getStatus();
      expect(status).toHaveProperty('online');
      expect(status).toHaveProperty('latencyMs');
      expect(status).toHaveProperty('qualityLevel');
      expect(['EXCELLENT', 'GOOD', 'MODERATE', 'POOR', 'OFFLINE']).toContain(status.qualityLevel);
    });
  });

  describe('Deterministic Download Rules (Phase 6)', () => {
    it('matches pre-download rules by extension and domain', () => {
      const ruleEngine = new RuleEngine();
      ruleEngine.setRules([
        {
          id: 'rule_iso_high_priority',
          name: 'ISO High Priority',
          enabled: true,
          trigger: 'PRE_DOWNLOAD',
          conditions: [{ field: 'extension', operator: 'equals', value: '.iso' }],
          actions: [
            { actionType: 'SET_CATEGORY', params: { category: 'disk_images' } },
            { actionType: 'SET_PRIORITY', params: { priority: 'high' } },
            { actionType: 'SET_CONNECTIONS', params: { maxConnections: 8 } },
          ],
        },
        {
          id: 'rule_github_domain',
          name: 'GitHub Downloads',
          enabled: true,
          trigger: 'PRE_DOWNLOAD',
          conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
          actions: [{ actionType: 'SET_CATEGORY', params: { category: 'software' } }],
        },
      ]);

      const isoMatch = ruleEngine.evaluatePreDownloadRules({
        url: 'https://releases.ubuntu.com/22.04/ubuntu.iso',
        filename: 'ubuntu.iso',
      });

      expect(isoMatch.category).toBe('disk_images');
      expect(isoMatch.priority).toBe('high');
      expect(isoMatch.maxConnections).toBe(8);
      expect(isoMatch.matchedRules).toContain('rule_iso_high_priority');

      const ghMatch = ruleEngine.evaluatePreDownloadRules({
        url: 'https://github.com/torvalds/linux/archive/master.zip',
        filename: 'master.zip',
      });

      expect(ghMatch.category).toBe('software');
      expect(ghMatch.matchedRules).toContain('rule_github_domain');
    });
  });

  describe('Backup & Restore (Phase 24)', () => {
    it('exports sanitized backup data without plain secret leaks', () => {
      const exportData = BackupService.exportData(db);
      expect(exportData.version).toBe(BackupService.CURRENT_SCHEMA_VERSION);
      expect(exportData.settings.security.apiKey).toBe('');
      expect(exportData.settings.network.proxyPassword).toBeUndefined();
      expect(exportData.settings.remote.telegramBotToken).toBe('');
    });

    it('safely validates and imports backup data', () => {
      const exportData = BackupService.exportData(db);
      const result = BackupService.importData(db, exportData);
      expect(result.success).toBe(true);
      expect(result.importedQueues).toBeGreaterThanOrEqual(0);
    });

    it('rejects invalid backup structures gracefully', () => {
      expect(() => {
        BackupService.importData(db, null);
      }).toThrow('Invalid backup file');

      expect(() => {
        BackupService.importData(db, { foo: 'bar' });
      }).toThrow('missing schema version');
    });
  });

  describe('Advanced Scheduler (Phase 5)', () => {
    it('computes scheduler status and window logic accurately', () => {
      const scheduler = new SchedulerService(db, engine);
      scheduler.setPowerSource('AC');
      scheduler.setNetworkType('WiFi');
      const status = scheduler.getStatus();

      expect(status.powerSource).toBe('AC');
      expect(status.networkType).toBe('WiFi');
      expect(typeof status.isWorkingHours).toBe('boolean');
      expect(typeof status.timeString).toBe('string');
    });
  });

  describe('Checksum Verification & Resolution (Phase 8)', () => {
    const testFilePath = path.join(process.cwd(), 'scratch_checksum_test.txt');

    beforeAll(() => {
      fs.writeFileSync(testFilePath, 'Hello G1DM 3.0 Verification Engine!', 'utf8');
    });

    afterAll(() => {
      if (fs.existsSync(testFilePath)) {
        try { fs.unlinkSync(testFilePath); } catch {}
      }
    });

    it('accurately verifies valid SHA-256 hash', async () => {
      const hash = await ChecksumVerifier.calculateFileHash(testFilePath, 'sha256');
      const info = await ChecksumVerifier.verifyChecksum(testFilePath, {
        algorithm: 'sha256',
        expected: hash,
        status: 'pending',
      });
      expect(info.status).toBe('verified');
      expect(info.actual).toBe(hash);
      expect(info.actual!.length).toBe(64);
    });

    it('correctly flags mismatched hash as failed without throwing', async () => {
      const info = await ChecksumVerifier.verifyChecksum(testFilePath, {
        algorithm: 'sha256',
        expected: '0000000000000000000000000000000000000000000000000000000000000000',
        status: 'pending',
      });
      expect(info.status).toBe('failed');
      expect(info.actual).not.toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });
  });
});
