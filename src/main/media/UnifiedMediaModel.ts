import { TlsInspectionResult } from '../engine/TlsInspector';

export interface UnifiedVideoVariant {
  id: string;
  resolutionLabel: string; // "2160p", "1440p", "1080p", "720p", "480p", "360p"
  width: number;
  height: number;
  frameRate?: number;
  bitrateBps: number;
  bitrateFormatted: string;
  videoCodec: string;
  isHdr: boolean;
  hdrLabel: 'HDR10' | 'HDR10+' | 'Dolby Vision' | 'HLG' | 'SDR';
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

export interface UnifiedAudioVariant {
  id: string;
  language: string;
  languageLabel: string;
  audioCodec: string;
  bitrateBps: number;
  bitrateFormatted: string;
  sampleRateHz: number;
  channels: number;
  downloadUrl: string;
  isDefault?: boolean;
}

export interface UnifiedSubtitleTrack {
  id: string;
  language: string;
  languageLabel: string;
  format: 'vtt' | 'ttml' | 'srt';
  downloadUrl: string;
  isForced?: boolean;
  isDefault?: boolean;
}

export interface UnifiedMediaSecurity {
  isProtected: boolean;
  drmSchemes: string[];
  protectionReason?: string;
  requiresAuthorization: boolean;
}

export interface DownloadCapabilityMatrix {
  https: boolean;
  rangeRequests: boolean;
  resume: boolean;
  multiConnection: boolean;
  hls: boolean;
  dash: boolean;
  audioSelection: boolean;
  subtitleSelection: boolean;
  muxing: boolean;
  drmDetected: boolean;
  browserIntegration: boolean;
}

export interface UnifiedMediaResource {
  sourceUrl: string;
  pageUrl: string;
  title: string;
  deliveryType: 'HLS' | 'DASH' | 'DIRECT_HTTPS' | 'DIRECT_HTTP';
  isLive: boolean;
  durationSec?: number;
  formattedDuration: string;
  thumbnailUrl?: string;
  tlsInfo?: TlsInspectionResult;
  videoVariants: UnifiedVideoVariant[];
  audioVariants: UnifiedAudioVariant[];
  subtitleTracks: UnifiedSubtitleTrack[];
  security: UnifiedMediaSecurity;
  downloadCapabilities: DownloadCapabilityMatrix;
  smartRecommendation?: {
    recommendedVariant?: UnifiedVideoVariant;
    recommendedAudio?: UnifiedAudioVariant;
    plainEnglishReason: string;
  };
  isDownloadable: boolean;
}

export class UnifiedMediaModelBuilder {
  public static buildRecommendation(
    variants: UnifiedVideoVariant[],
    audios: UnifiedAudioVariant[],
    availableStorageBytes: number = 100 * 1024 * 1024 * 1024
  ): { recommendedVariant?: UnifiedVideoVariant; recommendedAudio?: UnifiedAudioVariant; plainEnglishReason: string } {
    if (variants.length === 0) {
      return { plainEnglishReason: 'No video representations found in source.' };
    }

    // Filter variants that fit within storage
    const affordableVariants = variants.filter((v) => {
      const size = v.exactSizeBytes || v.estimatedSizeBytes || 0;
      return size === 0 || size < availableStorageBytes * 0.9;
    });

    const candidates = affordableVariants.length > 0 ? affordableVariants : variants;
    const sorted = [...candidates].sort((a, b) => b.recommendationScore - a.recommendationScore);
    const recommendedVariant = sorted[0];

    // Find default English or first audio
    const defaultAudio = audios.find((a) => a.language === 'en' || a.isDefault) || audios[0];

    const sizeStr = recommendedVariant.formattedSize;
    const codecStr = recommendedVariant.videoCodec;
    const reason = `★ Recommended: ${recommendedVariant.resolutionLabel} (${codecStr}, ${sizeStr}) provides the ideal balance of pristine visual fidelity, broad device compatibility, and download speed.`;

    return {
      recommendedVariant,
      recommendedAudio: defaultAudio,
      plainEnglishReason: reason,
    };
  }
}
