import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DoctorService } from '../src/main/db/DoctorService';

describe('System Doctor & Persistence Repair', () => {
  const testDir = path.join(__dirname, 'tmp_doctor_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should detect orphaned queue references and auto-repair them', async () => {
    const db = new AppDatabase(path.join(testDir, 'doctor.db'));
    await db.init();

    const brokenItem: any = {
      id: 'dl_broken_queue',
      url: 'https://example.com/file.zip',
      filename: 'file.zip',
      destinationDir: testDir,
      finalPath: path.join(testDir, 'file.zip'),
      tempPath: path.join(testDir, 'file.zip.part'),
      stateFilePath: path.join(testDir, 'file.zip.g1dm'),
      status: 'queued',
      totalBytes: 1000,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'other',
      queueId: 'deleted_non_existent_queue',
      priority: 'normal',
      maxConnections: 4,
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

    db.saveDownload(brokenItem);

    const report = await DoctorService.runDiagnostics(db);
    expect(report.healthy).toBe(false);
    expect(report.issues.some((iss) => iss.category === 'queue')).toBe(true);

    const repairResult = await DoctorService.autoRepair(db, report.issues.map((i) => i.id));
    expect(repairResult.repairedCount).toBeGreaterThanOrEqual(1);

    const fixedItem = db.getDownload('dl_broken_queue');
    expect(fixedItem?.queueId).toBe('default');

    db.close();
  });
});
