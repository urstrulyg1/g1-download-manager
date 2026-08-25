import { DownloadItem } from '../../shared/types';

/**
 * Derives a human-friendly clarity/resolution label for a download item.
 * Returns values like "8K", "4K", "1440p", "1080p", "720p", "480p", "360p", "HD", etc.
 */
export function getDownloadClarity(item: DownloadItem | null | undefined): string | undefined {
  if (!item) return undefined;

  const anyItem = item as any;

  // 1. Explicit clarity / qualityLabel / resolution metadata
  const explicit =
    anyItem.qualityLabel ||
    anyItem.clarity ||
    anyItem.resolution ||
    anyItem.mediaMetadata?.resolution;
  if (explicit && typeof explicit === 'string' && explicit.trim()) {
    const clean = explicit.trim();
    // Normalize e.g. "1080p (Full HD)" -> "1080p"
    const match = clean.match(/^(8K|4K|2K|4320p|2880p|2160p|1440p|1080p|720p|480p|360p|240p|144p|FHD|UHD|HD)/i);
    if (match) return match[1].toUpperCase().replace('P', 'p');
    return clean;
  }

  // 2. Explicit numeric height
  const height = anyItem.height || anyItem.mediaMetadata?.height;
  if (typeof height === 'number' && height > 0) {
    if (height >= 3840) return '8K';
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  }

  // 3. Format spec analysis (e.g. yt-dlp format strings with height<=1080)
  const formatSpec = anyItem.mediaFormatSpec || anyItem.formatSpec;
  if (formatSpec && typeof formatSpec === 'string') {
    const heightMatch = formatSpec.match(/height[<=~]*(\d+)/i) || formatSpec.match(/(\d{3,4})p/i);
    if (heightMatch && heightMatch[1]) {
      const h = parseInt(heightMatch[1], 10);
      if (h >= 3840) return '8K';
      if (h >= 2160) return '4K';
      if (h >= 1440) return '1440p';
      if (h >= 1080) return '1080p';
      if (h >= 720) return '720p';
      if (h >= 480) return '480p';
      if (h >= 360) return '360p';
      return `${h}p`;
    }
  }

  // 4. Filename resolution pattern match
  if (item.filename) {
    const fnMatch = item.filename.match(/\b(8K|4K|2K|4320p|2880p|2160p|1440p|1080p|720p|480p|360p|240p|144p|FHD|UHD|QHD)\b/i);
    if (fnMatch) {
      return fnMatch[1].toUpperCase().replace('P', 'p');
    }
  }

  // 5. Fallback for video category with known stream/large size
  if (item.category === 'video') {
    if (item.totalBytes > 250 * 1024 * 1024) return '1080p';
    if (item.totalBytes > 80 * 1024 * 1024) return '720p';
    return 'HD';
  }

  return undefined;
}
