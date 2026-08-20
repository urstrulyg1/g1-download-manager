export interface HlsVariantRendition {
  bandwidth: number;
  resolution?: string;
  codecs?: string;
  url: string;
  frameRate?: number;
  audioGroupId?: string;
}

export interface HlsMediaSegment {
  index: number;
  url: string;
  durationSec: number;
  byteRange?: { length: number; offset: number };
  initSegmentUrl?: string;
  isDiscontinuity?: boolean;
}

export class MediaManifestParser {
  public static isMasterPlaylist(m3u8Content: string): boolean {
    return m3u8Content.includes('#EXT-X-STREAM-INF');
  }

  public static parseMasterPlaylist(m3u8Content: string, baseUrl: string): HlsVariantRendition[] {
    const lines = m3u8Content.split(/\r?\n/);
    const variants: HlsVariantRendition[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
        const resolutionMatch = line.match(/RESOLUTION=([0-9x]+)/i);
        const codecsMatch = line.match(/CODECS="([^"]+)"/i);
        const frameRateMatch = line.match(/FRAME-RATE=([0-9.]+)/i);
        const audioGroupMatch = line.match(/AUDIO="([^"]+)"/i);

        const nextLine = lines[i + 1]?.trim();
        if (nextLine && !nextLine.startsWith('#')) {
          try {
            const fullUrl = new URL(nextLine, baseUrl).href;
            variants.push({
              bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0,
              resolution: resolutionMatch ? resolutionMatch[1] : undefined,
              codecs: codecsMatch ? codecsMatch[1] : undefined,
              frameRate: frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined,
              audioGroupId: audioGroupMatch ? audioGroupMatch[1] : undefined,
              url: fullUrl,
            });
          } catch {}
        }
      }
    }

    return variants.sort((a, b) => b.bandwidth - a.bandwidth);
  }

  public static parseMediaPlaylist(m3u8Content: string, baseUrl: string): HlsMediaSegment[] {
    const lines = m3u8Content.split(/\r?\n/);
    const segments: HlsMediaSegment[] = [];

    let currentDuration = 0;
    let currentByteRange: { length: number; offset: number } | undefined;
    let currentInitSegment: string | undefined;
    let isDiscontinuity = false;
    let lastByteRangeOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXT-X-MAP:URI=')) {
        const match = line.match(/URI="([^"]+)"/i);
        if (match) {
          try {
            currentInitSegment = new URL(match[1], baseUrl).href;
          } catch {}
        }
      } else if (line.startsWith('#EXTINF:')) {
        const durMatch = line.match(/#EXTINF:([0-9.]+)/i);
        if (durMatch) {
          currentDuration = parseFloat(durMatch[1]);
        }
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        const brMatch = line.match(/#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/i);
        if (brMatch) {
          const length = parseInt(brMatch[1], 10);
          const offset = brMatch[2] ? parseInt(brMatch[2], 10) : lastByteRangeOffset;
          currentByteRange = { length, offset };
          lastByteRangeOffset = offset + length;
        }
      } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        isDiscontinuity = true;
      } else if (line && !line.startsWith('#')) {
        try {
          const segmentUrl = new URL(line, baseUrl).href;
          segments.push({
            index: segments.length + 1,
            url: segmentUrl,
            durationSec: currentDuration,
            byteRange: currentByteRange,
            initSegmentUrl: currentInitSegment,
            isDiscontinuity,
          });

          // Reset transient flags
          currentDuration = 0;
          currentByteRange = undefined;
          isDiscontinuity = false;
        } catch {}
      }
    }

    return segments;
  }
}
