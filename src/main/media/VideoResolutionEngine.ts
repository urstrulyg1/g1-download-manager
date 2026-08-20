export interface AnalyzedVideoQuality {
  id: string;
  resolutionLabel: string; // "2160p", "1440p", "1080p", "720p", "480p", "360p"
  width: number;
  height: number;
  frameRate?: number;
  bitrateBps: number;
  bitrateFormatted: string;
  videoCodec: string;
  isHdr: boolean;
  hdrLabel: 'HDR10' | 'Dolby Vision' | 'SDR';
  container: string;
  exactSizeBytes?: number;
  estimatedSizeBytes?: number;
  formattedSize: string;
  isEstimatedSize: boolean;
  downloadUrl: string;
  protocol: 'hls' | 'dash' | 'http' | 'https';
  isRecommended: boolean;
  recommendationScore: number;
}

export interface AnalyzedAudioTrack {
  id: string;
  language: string;
  languageLabel: string;
  audioCodec: string;
  bitrateBps: number;
  bitrateFormatted: string;
  sampleRateHz: number;
  channels: number;
  downloadUrl: string;
}

export class VideoResolutionEngine {
  public static computeResolutionLabel(width: number, height: number): string {
    if (height >= 2160 || width >= 3840) return '2160p';
    if (height >= 1440 || width >= 2560) return '1440p';
    if (height >= 1080 || width >= 1920) return '1080p';
    if (height >= 720 || width >= 1280) return '720p';
    if (height >= 480 || width >= 854) return '480p';
    if (height >= 360 || width >= 640) return '360p';
    if (height >= 240) return '240p';
    return height > 0 ? `${height}p` : 'Auto';
  }

  public static formatBitrate(bps: number): string {
    if (bps <= 0) return 'Variable Bitrate';
    if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    }
    return `${Math.round(bps / 1000)} kbps`;
  }

  public static formatBytes(bytes: number): string {
    if (bytes <= 0) return 'Unknown Size';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  public static estimateSize(bitrateBps: number, durationSec?: number, exactBytes?: number): { sizeBytes: number; isEstimated: boolean; formatted: string } {
    if (exactBytes && exactBytes > 0) {
      return {
        sizeBytes: exactBytes,
        isEstimated: false,
        formatted: this.formatBytes(exactBytes),
      };
    }

    if (bitrateBps > 0 && durationSec && durationSec > 0) {
      // (bitrate in bps / 8) * duration in seconds
      const est = Math.round((bitrateBps / 8) * durationSec);
      return {
        sizeBytes: est,
        isEstimated: true,
        formatted: `~${this.formatBytes(est)}`,
      };
    }

    return {
      sizeBytes: 0,
      isEstimated: true,
      formatted: 'Variable / Stream',
    };
  }

  public static scoreRecommendation(q: AnalyzedVideoQuality): number {
    let score = 50;
    // Prefer 1080p / 1440p for optimal quality/size balance
    if (q.height === 1080) score += 35;
    else if (q.height === 1440) score += 30;
    else if (q.height === 2160) score += 25;
    else if (q.height === 720) score += 20;

    // Prefer modern codecs
    if (q.videoCodec.includes('AV1') || q.videoCodec.includes('HEVC')) score += 10;
    if (q.isHdr) score += 5;

    return score;
  }

  public static sortQualities(
    qualities: AnalyzedVideoQuality[],
    sortBy: 'RECOMMENDED' | 'HIGHEST_QUALITY' | 'LOWEST_QUALITY' | 'BEST_BITRATE' | 'SMALLEST_FILE' = 'RECOMMENDED'
  ): AnalyzedVideoQuality[] {
    const list = [...qualities];

    switch (sortBy) {
      case 'HIGHEST_QUALITY':
        return list.sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps);
      case 'LOWEST_QUALITY':
        return list.sort((a, b) => a.height - b.height || a.bitrateBps - b.bitrateBps);
      case 'BEST_BITRATE':
        return list.sort((a, b) => b.bitrateBps - a.bitrateBps);
      case 'SMALLEST_FILE':
        return list.sort((a, b) => (a.exactSizeBytes || a.estimatedSizeBytes || 0) - (b.exactSizeBytes || b.estimatedSizeBytes || 0));
      case 'RECOMMENDED':
      default:
        return list.sort((a, b) => b.recommendationScore - a.recommendationScore);
    }
  }
}
