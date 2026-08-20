import { MediaCache } from '../src/main/media/MediaCache';
import { UnifiedMediaResource } from '../src/main/media/UnifiedMediaModel';

describe('Media Cache & Dynamic Manifest Invalidation', () => {
  it('should cache media analysis and invalidate on ETag or timestamp change', () => {
    const mockRes: any = { title: 'Cached Video', deliveryType: 'HLS' };
    MediaCache.set('https://cdn.example.com/stream.m3u8', mockRes, '"etag_1"', 'Wed, 20 Aug 2026');

    // Matching ETag -> Hits cache
    const hit = MediaCache.get('https://cdn.example.com/stream.m3u8', '"etag_1"', 'Wed, 20 Aug 2026');
    expect(hit).toBeDefined();
    expect(hit?.title).toBe('Cached Video');

    // Changed ETag -> Invalidates cache
    const miss = MediaCache.get('https://cdn.example.com/stream.m3u8', '"etag_2_changed"');
    expect(miss).toBeUndefined();
  });
});
