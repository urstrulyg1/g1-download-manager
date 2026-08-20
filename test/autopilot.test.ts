import { DownloadAutopilot } from '../src/main/intelligence/DownloadAutopilot';

describe('G1DM Download Autopilot Engine', () => {
  it('should trigger PAUSE_LOW_STORAGE when required file size exceeds free disk space', () => {
    const mockItem: any = {
      id: 'dl_auto_1',
      totalBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      downloadedBytes: 1024 * 1024,
      activeConnections: 8,
      speed: 10 * 1024 * 1024,
    };

    const decision = DownloadAutopilot.evaluateDownload(mockItem, 2 * 1024 * 1024 * 1024); // Only 2 GB available
    expect(decision.actionType).toBe('PAUSE_LOW_STORAGE');
    expect(decision.confidence).toBe('HIGH');
    expect(decision.explanation).toContain('requires 5119 MB');
  });

  it('should recommend socket consolidation when connections are unproductive', () => {
    const mockItem: any = {
      id: 'dl_auto_2',
      totalBytes: 100 * 1024 * 1024,
      downloadedBytes: 10 * 1024 * 1024,
      activeConnections: 8,
      speed: 100 * 1024, // 100 KB/s across 8 sockets = ~12 KB/s per socket (unproductive)
    };

    const decision = DownloadAutopilot.evaluateDownload(mockItem, 50 * 1024 * 1024 * 1024);
    expect(decision.actionType).toBe('REDUCE_CONNECTIONS');
    expect(decision.recommendedValue).toContain('4 sockets');
  });

  it('should recommend METERED profile when on battery under 20%', () => {
    const mockItem: any = {
      id: 'dl_auto_3',
      totalBytes: 100 * 1024 * 1024,
      downloadedBytes: 0,
      activeConnections: 8,
      speed: 5 * 1024 * 1024,
    };

    const decision = DownloadAutopilot.evaluateDownload(mockItem, 50 * 1024 * 1024 * 1024, false, 15); // Battery 15%
    expect(decision.actionType).toBe('APPLY_METERED_PROFILE');
  });
});
