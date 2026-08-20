import { NetworkQualityService } from '../src/main/network/NetworkQualityService';

describe('Network Quality & Bandwidth Budget Suite', () => {
  it('should measure latency, jitter, and DNS lookup metrics', async () => {
    const service = new NetworkQualityService();
    const report = await service.measureQuality();

    expect(typeof report.latencyMs).toBe('number');
    expect(typeof report.jitterMs).toBe('number');
    expect(typeof report.dnsLatencyMs).toBe('number');
    expect(report.qualityRating).toBeDefined();
  });

  it('should track daily and monthly bandwidth budgets and enforce throttling when exhausted', async () => {
    const service = new NetworkQualityService();
    service.setBudgetConfig({
      dailyLimitBytes: 100 * 1024 * 1024, // 100 MB daily budget
      autoThrottleOnExhaustion: true,
      throttleSpeedLimitBytesPerSec: 128 * 1024,
    });

    // Record 50 MB
    service.recordBytesTransferred(50 * 1024 * 1024);
    let report = await service.measureQuality();
    expect(report.bandwidthBudget.isThrottledByBudget).toBe(false);
    expect(report.bandwidthBudget.remainingDailyBytes).toBe(50 * 1024 * 1024);

    // Record another 60 MB (exceeds 100 MB budget)
    service.recordBytesTransferred(60 * 1024 * 1024);
    report = await service.measureQuality();
    expect(report.bandwidthBudget.isThrottledByBudget).toBe(true);
    expect(report.bandwidthBudget.remainingDailyBytes).toBe(0);
  });
});
