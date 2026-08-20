import { HlsVariantRendition } from './MediaManifestParser';
import { UnifiedVideoVariant } from './UnifiedMediaModel';
import { VideoResolutionEngine } from './VideoResolutionEngine';

export class HlsVariantSelector {
  public static selectBestVariant(
    variants: UnifiedVideoVariant[],
    preferredResolution?: string,
    maxHeight?: number
  ): UnifiedVideoVariant | undefined {
    if (variants.length === 0) return undefined;

    if (preferredResolution) {
      const match = variants.find((v) => v.resolutionLabel.toLowerCase() === preferredResolution.toLowerCase());
      if (match) return match;
    }

    if (maxHeight && maxHeight > 0) {
      const underCap = variants.filter((v) => v.height <= maxHeight);
      if (underCap.length > 0) {
        return underCap.sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps)[0];
      }
    }

    // Default to recommended or highest quality
    return variants.find((v) => v.isRecommended) || variants[0];
  }
}
