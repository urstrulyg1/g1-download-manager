import { ForensicsEngine } from '../src/main/storage/ForensicsEngine';
import { LiveStreamRecorder } from '../src/main/media/LiveStreamRecorder';
import * as fs from 'fs';
import * as path from 'path';

describe('Partial Data Forensics & Live Stream Recorder Suite', () => {
  const testDir = path.join(__dirname, 'tmp_forensics_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('ForensicsEngine', () => {
    it('should map healthy completed segments and enable selective resumption', () => {
      const tempPath = path.join(testDir, 'partial.zip.part');
      fs.writeFileSync(tempPath, Buffer.alloc(1024 * 1024)); // 1 MB on disk

      const segments: any[] = [
        { id: 1, downloadedBytes: 512 * 1024, status: 'completed' },
        { id: 2, downloadedBytes: 0, status: 'failed' },
      ];

      const report = ForensicsEngine.analyzePartialFile(tempPath, 1024 * 1024, segments);
      expect(report.canSelectivelyResume).toBe(true);
      expect(report.healthyBytesRecovered).toBe(512 * 1024);
      expect(report.uncompletedSegments).toContain(2);
    });

    it('should report fresh start required when temp file is missing', () => {
      const report = ForensicsEngine.analyzePartialFile(path.join(testDir, 'non_existent.part'), 1000);
      expect(report.canSelectivelyResume).toBe(false);
      expect(report.healthyBytesRecovered).toBe(0);
    });

    it('should handle fully completed partial files safely', () => {
      const tempPath = path.join(testDir, 'full.bin.part');
      fs.writeFileSync(tempPath, Buffer.alloc(2048));

      const segments: any[] = [
        { id: 1, downloadedBytes: 1024, status: 'completed' },
        { id: 2, downloadedBytes: 1024, status: 'completed' },
      ];

      const report = ForensicsEngine.analyzePartialFile(tempPath, 2048, segments);
      expect(report.healthyBytesRecovered).toBe(2048);
      expect(report.missingBytes).toBe(0);
      expect(report.uncompletedSegments.length).toBe(0);
    });
  });

  describe('LiveStreamRecorder', () => {
    it('should track live recording sessions and enforce storage cutoffs', () => {
      const recorder = new LiveStreamRecorder();
      const session = recorder.startRecording({
        streamUrl: 'https://cdn.example.com/live.m3u8',
        outputFilePath: path.join(testDir, 'live.ts'),
        maxStorageBytes: 1024 * 1024, // 1 MB limit
        maxDurationSeconds: 60,
      });

      expect(session.status).toBe('RECORDING');

      // Record 1.5 MB in segments -> hits cutoff!
      recorder.recordSegment(session.sessionId, 1.5 * 1024 * 1024, 6.0);
      expect(session.status).toBe('STORAGE_LIMIT_REACHED');

      const stopped = recorder.stopRecording(session.sessionId);
      expect(stopped?.status).toBe('STOPPED');
    });

    it('should handle multiple concurrent live recording sessions independently', () => {
      const recorder = new LiveStreamRecorder();
      const s1 = recorder.startRecording({ streamUrl: 'https://cdn.com/live1.m3u8', outputFilePath: 'live1.ts' });
      const s2 = recorder.startRecording({ streamUrl: 'https://cdn.com/live2.m3u8', outputFilePath: 'live2.ts' });

      expect(s1.sessionId).not.toBe(s2.sessionId);
      recorder.stopRecording(s1.sessionId);

      expect(recorder.stopRecording(s2.sessionId)?.status).toBe('STOPPED');
    });
  });
});
