import { getDownloadClarity } from '../src/renderer/lib/downloadClarity';
import { DownloadItem } from '../src/shared/types';

describe('downloadClarity utility', () => {
  const createMockItem = (overrides: Partial<DownloadItem> = {}): DownloadItem => {
    return {
      id: 'dl_test_1',
      url: 'https://example.com/video.mp4',
      filename: 'video.mp4',
      destinationDir: '/downloads',
      finalPath: '/downloads/video.mp4',
      tempPath: '/downloads/video.mp4.part',
      stateFilePath: '/downloads/video.mp4.g1dm',
      status: 'completed',
      totalBytes: 123456789,
      downloadedBytes: 123456789,
      progress: 100,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'video',
      queueId: 'default',
      priority: 'normal',
      maxConnections: 8,
      activeConnections: 0,
      segments: [],
      speedHistory: [],
      serverCapabilities: {
        supportsRange: true,
        protocol: 'https',
        redirectChain: [],
        authRequired: false,
        probedAt: Date.now(),
      },
      speedLimitBytesPerSec: 0,
      error: null,
      retryCount: 0,
      maxRetries: 5,
      createdAt: Date.now(),
      durationMs: 1000,
      logs: [],
      ...overrides,
    };
  };

  it('returns explicit qualityLabel when present', () => {
    const item = createMockItem({ qualityLabel: '1080p' });
    expect(getDownloadClarity(item)).toBe('1080p');
  });

  it('normalizes qualityLabel string formats like "1080p (Full HD)"', () => {
    const item = createMockItem({ qualityLabel: '1080p (Full HD)' });
    expect(getDownloadClarity(item)).toBe('1080p');
  });

  it('extracts clarity from formatSpec', () => {
    const item = createMockItem({
      mediaFormatSpec: 'bestvideo[height<=2160]+bestaudio/best',
    });
    expect(getDownloadClarity(item)).toBe('4K');

    const item1080 = createMockItem({
      mediaFormatSpec: 'bestvideo[height<=1080]+bestaudio/best',
    });
    expect(getDownloadClarity(item1080)).toBe('1080p');

    const item720 = createMockItem({
      mediaFormatSpec: 'bestvideo[height<=720]+bestaudio/best',
    });
    expect(getDownloadClarity(item720)).toBe('720p');
  });

  it('extracts clarity from filename resolution patterns', () => {
    const item = createMockItem({
      filename: 'Sample Video 1080p.mkv',
    });
    expect(getDownloadClarity(item)).toBe('1080p');

    const item4k = createMockItem({
      filename: 'Big Buck Bunny 4K.mp4',
    });
    expect(getDownloadClarity(item4k)).toBe('4K');
  });

  it('returns height-based clarity when height is set', () => {
    const item = createMockItem({
      height: 1440,
    } as any);
    expect(getDownloadClarity(item)).toBe('1440p');
  });

  it('returns undefined for non-video categories without clarity', () => {
    const item = createMockItem({
      category: 'document',
      filename: 'report.pdf',
    });
    expect(getDownloadClarity(item)).toBeUndefined();
  });
});
