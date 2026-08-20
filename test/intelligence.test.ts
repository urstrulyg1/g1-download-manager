import { DownloadIntelligence } from '../src/main/engine/DownloadIntelligence';
import { DownloadItem } from '../src/shared/types';

describe('Download Intelligence & Smart Duplication Engine', () => {
  it('should accurately calculate health scores and reliability metrics', () => {
    const mockItem: any = {
      id: 'dl_health_test',
      url: 'https://cdn.example.com/bigfile.zip',
      filename: 'bigfile.zip',
      totalBytes: 50 * 1024 * 1024,
      downloadedBytes: 10 * 1024 * 1024,
      retryCount: 0,
      activeConnections: 8,
      serverCapabilities: {
        supportsRange: true,
        etag: '"etag-12345"',
        lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
        protocol: 'https',
      },
    };

    const health = DownloadIntelligence.calculateHealth(mockItem, 100 * 1024 * 1024 * 1024); // 100GB free
    expect(health.healthScore).toBeGreaterThanOrEqual(80);
    expect(health.resumeReliability).toBe('High');
    expect(health.storageRisk).toBe('None');
  });

  it('should detect duplicate resources by normalized URL and ETag', () => {
    const existing: any[] = [
      {
        id: 'dl_existing_1',
        url: 'https://cdn.example.com/archive.zip#section1',
        filename: 'archive.zip',
        totalBytes: 1048576,
        checksum: { actual: 'a1b2c3d4e5f6' },
        serverCapabilities: { etag: '"unique-etag-99"' },
      },
    ];

    const dupBySha = DownloadIntelligence.detectDuplicate(
      { url: 'https://other-mirror.com/file.zip', sha256: 'a1b2c3d4e5f6' },
      existing
    );
    expect(dupBySha.classification).toBe('DEFINITELY_DUPLICATE');

    const dupByUrl = DownloadIntelligence.detectDuplicate(
      { url: 'https://cdn.example.com/archive.zip' },
      existing
    );
    expect(dupByUrl.classification).toBe('PROBABLY_DUPLICATE');
  });
});
