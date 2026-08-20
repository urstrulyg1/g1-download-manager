import { HealthScore2 } from '../src/main/intelligence/HealthScore2';

describe('Download Health Score 2.0 & Multi-Dimensional Metrics', () => {
  it('should compute granular multi-dimensional scores and explain overall score', () => {
    const mockItem: any = {
      id: 'dl_health2_1',
      totalBytes: 500 * 1024 * 1024,
      downloadedBytes: 100 * 1024 * 1024,
      speed: 10 * 1024 * 1024,
      retryCount: 0,
      activeConnections: 8,
      serverCapabilities: { supportsRange: true },
      checksum: { status: 'verified' },
    };

    const health = HealthScore2.calculate(mockItem, 50 * 1024 * 1024 * 1024);
    expect(health.overallScore).toBeGreaterThanOrEqual(90);
    expect(health.networkScore).toBeGreaterThanOrEqual(90);
    expect(health.serverScore).toBe(90);
    expect(health.resumeSafetyScore).toBe(100);
    expect(health.storageSafetyScore).toBe(100);
    expect(health.overallExplanation).toContain('peak health');
  });

  it('should detect predictive failures for low storage and server throttling', () => {
    const mockItem: any = {
      id: 'dl_pred_1',
      totalBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      downloadedBytes: 1 * 1024 * 1024 * 1024,
      speed: 10 * 1024 * 1024, // 10 MB/s
      retryCount: 3,
      activeConnections: 8,
      serverCapabilities: { supportsRange: true },
    };

    const health = HealthScore2.calculate(mockItem, 2 * 1024 * 1024 * 1024); // 2GB available vs 9GB needed
    expect(health.predictedFailures.length).toBeGreaterThanOrEqual(2);
    expect(health.predictedFailures.some((p) => p.type === 'STORAGE_EXHAUSTION')).toBe(true);
    expect(health.predictedFailures.some((p) => p.type === 'SERVER_THROTTLING')).toBe(true);
  });
});
