import { ResumeSafetyEngine } from '../src/main/engine/ResumeSafetyEngine';

describe('Resume Safety Engine', () => {
  it('should allow resume when ETag and headers match perfectly', () => {
    const savedItem: any = {
      totalBytes: 1048576,
      serverCapabilities: {
        supportsRange: true,
        etag: '"etag_version_1"',
        lastModified: 'Thu, 20 Aug 2026 12:00:00 GMT',
      },
    };

    const freshCap: any = {
      supportsRange: true,
      etag: '"etag_version_1"',
      lastModified: 'Thu, 20 Aug 2026 12:00:00 GMT',
      contentLength: 1048576,
    };

    const report = ResumeSafetyEngine.evaluate(savedItem, freshCap);
    expect(report.canSafelyResume).toBe(true);
    expect(report.decision).toBe('SAFE_TO_RESUME');
    expect(report.safetyScorePct).toBe(100);
  });

  it('should block resume and mandate full restart when remote ETag changes', () => {
    const savedItem: any = {
      totalBytes: 1048576,
      serverCapabilities: {
        supportsRange: true,
        etag: '"etag_version_1"',
      },
    };

    const freshCap: any = {
      supportsRange: true,
      etag: '"etag_version_2_changed"',
      contentLength: 1048576,
    };

    const report = ResumeSafetyEngine.evaluate(savedItem, freshCap);
    expect(report.canSafelyResume).toBe(false);
    expect(report.decision).toBe('REMOTE_RESOURCE_CHANGED');
    expect(report.reason).toContain('Remote ETag changed');
  });

  it('should mandate restart when server lacks Range support', () => {
    const savedItem: any = {
      totalBytes: 1048576,
      serverCapabilities: { supportsRange: false },
    };

    const freshCap: any = {
      supportsRange: false,
    };

    const report = ResumeSafetyEngine.evaluate(savedItem, freshCap);
    expect(report.canSafelyResume).toBe(false);
    expect(report.decision).toBe('FULL_RESTART_REQUIRED');
  });
});
