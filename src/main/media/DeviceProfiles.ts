import { UnifiedVideoVariant } from './UnifiedMediaModel';

export type DeviceProfileType = 'DESKTOP' | 'MOBILE' | 'TV_4K' | 'ARCHIVE' | 'SMALLEST_FILE';

export class DeviceProfiles {
  public static selectForProfile(
    variants: UnifiedVideoVariant[],
    profileType: DeviceProfileType = 'DESKTOP'
  ): UnifiedVideoVariant | undefined {
    if (variants.length === 0) return undefined;

    switch (profileType) {
      case 'MOBILE': {
        // Prefer 720p or 1080p H.264 under 4 Mbps
        const mobileCandidates = variants.filter((v) => v.height <= 1080 && v.bitrateBps <= 4500000);
        if (mobileCandidates.length > 0) {
          return mobileCandidates.sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps)[0];
        }
        return variants.find((v) => v.height === 720) || variants[0];
      }

      case 'TV_4K': {
        // Prefer 2160p / 1440p HDR
        const hdr4k = variants.find((v) => v.height >= 2160 && v.isHdr);
        if (hdr4k) return hdr4k;
        const any4k = variants.find((v) => v.height >= 2160);
        if (any4k) return any4k;
        return variants.sort((a, b) => b.height - a.height)[0];
      }

      case 'ARCHIVE': {
        // Highest resolution, highest bitrate
        return [...variants].sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps)[0];
      }

      case 'SMALLEST_FILE': {
        return [...variants].sort((a, b) => (a.exactSizeBytes || a.estimatedSizeBytes || 0) - (b.exactSizeBytes || b.estimatedSizeBytes || 0))[0];
      }

      case 'DESKTOP':
      default: {
        return variants.find((v) => v.isRecommended) || variants.find((v) => v.height === 1080) || variants[0];
      }
    }
  }
}
