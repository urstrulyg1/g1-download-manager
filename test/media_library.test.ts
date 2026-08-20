import { MediaLibrary } from '../src/main/media/MediaLibrary';
import { TemplateManager } from '../src/main/engine/TemplateManager';

describe('Media Library, Templates & Comparison Suite', () => {
  it('should index completed media and perform side-by-side comparison', () => {
    const library = new MediaLibrary();

    const mockA: any = {
      id: 'd1',
      filename: 'movie_2160p.mp4',
      finalPath: '/path/movie_2160p.mp4',
      category: 'video',
      status: 'completed',
      avgSpeed: 20 * 1024 * 1024, // 20 MB/s
      totalBytes: 2000000000,
      serverCapabilities: { protocol: 'https' },
      durationMs: 100000,
    };

    const mockB: any = {
      id: 'd2',
      filename: 'movie_1080p.mp4',
      finalPath: '/path/movie_1080p.mp4',
      category: 'video',
      status: 'completed',
      avgSpeed: 10 * 1024 * 1024, // 10 MB/s
      totalBytes: 1000000000,
      serverCapabilities: { protocol: 'https' },
      durationMs: 100000,
    };

    library.indexDownload(mockA, ['4k', 'movie']);
    expect(library.getLibrary().length).toBe(1);

    const comparison = library.compareDownloads(mockA, mockB);
    expect(comparison.speedDeltaRatio).toBe(2);
    expect(comparison.fasterItem).toBe('movie_2160p.mp4');
  });

  it('should manage download templates and favorites', () => {
    const mgr = new TemplateManager();
    expect(mgr.getTemplates().length).toBeGreaterThanOrEqual(2);

    const fav = mgr.addFavorite({
      title: 'Ubuntu Daily Builds',
      url: 'https://cdimage.ubuntu.com/daily-live/current/',
      tags: ['linux', 'daily'],
    });

    expect(fav.id).toBeDefined();
    expect(mgr.getFavorites().length).toBeGreaterThanOrEqual(1);
  });
});
