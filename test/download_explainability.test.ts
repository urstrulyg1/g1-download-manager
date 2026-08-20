import { DownloadExplainability } from '../src/main/engine/DownloadExplainability';
import { DownloadItem } from '../src/shared/types';

describe('Download Explainability & Bottleneck Analyzer', () => {
  it('should detect when global bandwidth limiter is the primary bottleneck', () => {
    const mockItem: any = {
      id: 'dl_exp_1',
      speed: 500 * 1024,
      avgSpeed: 500 * 1024,
      activeConnections: 4,
      maxConnections: 8,
      status: 'downloading',
      category: 'archive',
      retryCount: 0,
      serverCapabilities: { supportsRange: true },
    };

    const report = DownloadExplainability.analyze(mockItem, 512 * 1024); // 512 KB/s cap
    expect(report.primaryBottleneck).toBe('GLOBAL_SPEED_LIMIT');
    expect(report.bottleneckExplanation).toContain('global speed limit');
  });

  it('should generate plain-English explanations for speed and status', () => {
    const mockItem: any = {
      id: 'dl_exp_2',
      speed: 5 * 1024 * 1024,
      activeConnections: 8,
      maxConnections: 8,
      status: 'downloading',
      category: 'video',
      retryCount: 0,
      serverCapabilities: { supportsRange: true },
    };

    const report = DownloadExplainability.analyze(mockItem, 0); // Unlimited
    expect(report.whyIsSpeed).toContain('Dynamic segment splitting active');
    expect(report.whyIsStatus).toContain('sparse file');
  });
});
