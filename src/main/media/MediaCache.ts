import { UnifiedMediaResource } from './UnifiedMediaModel';

export interface MediaCacheEntry {
  url: string;
  resource: UnifiedMediaResource;
  etag?: string;
  lastModified?: string;
  cachedAt: number;
  ttlMs: number;
}

export class MediaCache {
  private static cache: Map<string, MediaCacheEntry> = new Map();
  private static readonly DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

  public static set(url: string, resource: UnifiedMediaResource, etag?: string, lastModified?: string, ttlMs = this.DEFAULT_TTL_MS): void {
    this.cache.set(url, {
      url,
      resource,
      etag,
      lastModified,
      cachedAt: Date.now(),
      ttlMs,
    });
  }

  public static get(url: string, freshEtag?: string, freshModified?: string): UnifiedMediaResource | undefined {
    const entry = this.cache.get(url);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(url);
      return undefined;
    }

    // Check ETag & Last-Modified change
    if (freshEtag && entry.etag && entry.etag !== freshEtag) {
      this.cache.delete(url);
      return undefined;
    }

    if (freshModified && entry.lastModified && entry.lastModified !== freshModified) {
      this.cache.delete(url);
      return undefined;
    }

    return entry.resource;
  }

  public static clear(): void {
    this.cache.clear();
  }
}
