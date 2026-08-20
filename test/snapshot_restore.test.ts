import { SnapshotManager } from '../src/main/engine/SnapshotManager';
import { DownloadItem } from '../src/shared/types';

describe('Download Snapshots & Restoration Suite', () => {
  it('should create sanitized downloadable snapshots without secrets', () => {
    const mockItem: any = {
      id: 'dl_snap_test',
      url: 'https://cdn.example.com/data.iso?token=secret123',
      filename: 'data.iso',
      totalBytes: 2000000,
      downloadedBytes: 500000,
      category: 'archive',
      queueId: 'default',
      priority: 'high',
      createdAt: Date.now(),
      serverCapabilities: { supportsRange: true, protocol: 'https' },
      segments: [{ id: 1, startOffset: 0, endOffset: 1999999, downloadedBytes: 500000, status: 'downloading' }],
    };

    const snap = SnapshotManager.createSnapshot(mockItem);
    expect(snap.version).toBe('1.0.0');
    expect(snap.filename).toBe('data.iso');
    expect(snap.url).not.toContain('secret123'); // Sanitized!

    const validated = SnapshotManager.validateAndLoadSnapshot(JSON.stringify(snap));
    expect(validated.valid).toBe(true);
    expect(validated.snapshot?.downloadId).toBe('dl_snap_test');
  });
});
