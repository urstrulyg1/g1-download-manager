import { DashManifestParser, DashManifestParseResult } from './DashManifestParser';
import {
  UnifiedMediaResource,
  UnifiedVideoVariant,
  UnifiedAudioVariant,
  UnifiedSubtitleTrack,
  UnifiedMediaModelBuilder,
} from './UnifiedMediaModel';
import { VideoResolutionEngine } from './VideoResolutionEngine';

export class DashEngine {
  public static isDash(url: string, content?: string): boolean {
    if (url.includes('.mpd')) return true;
    if (content && (content.includes('<MPD') || content.includes('xmlns="urn:mpeg:dash:schema:mpd:2011"'))) return true;
    return false;
  }

  public static parseDashToUnifiedModel(
    mpdXml: string,
    manifestUrl: string,
    pageUrl: string = manifestUrl
  ): UnifiedMediaResource {
    const parsed = DashManifestParser.parse(mpdXml, manifestUrl);
    const isLive = mpdXml.includes('type="dynamic"');

    const videoVariants: UnifiedVideoVariant[] = parsed.videoRepresentations.map((v, i) => {
      const sizeEst = VideoResolutionEngine.estimateSize(v.bandwidth, parsed.durationSec);
      const qualityObj: UnifiedVideoVariant = {
        id: `dash_v_${v.id || i + 1}`,
        resolutionLabel: v.qualityLabel,
        width: v.width,
        height: v.height,
        frameRate: v.frameRate || 30,
        bitrateBps: v.bandwidth,
        bitrateFormatted: VideoResolutionEngine.formatBitrate(v.bandwidth),
        videoCodec: v.codecs || 'H.264 / AVC',
        isHdr: v.isHdr,
        hdrLabel: v.isHdr ? 'HDR10' : 'SDR',
        container: 'MP4 / DASH',
        estimatedSizeBytes: sizeEst.sizeBytes,
        formattedSize: sizeEst.formatted,
        isEstimatedSize: true,
        downloadUrl: manifestUrl,
        protocol: 'dash',
        isRecommended: false,
        recommendationScore: 0,
      };

      qualityObj.recommendationScore = VideoResolutionEngine.scoreRecommendation(qualityObj as any);
      return qualityObj;
    });

    const audioVariants: UnifiedAudioVariant[] = parsed.audioRepresentations.map((a, i) => ({
      id: `dash_a_${a.id || i + 1}`,
      language: a.language || 'und',
      languageLabel: a.language === 'en' ? 'English' : a.language || 'Default Audio',
      audioCodec: a.codecs || 'AAC',
      bitrateBps: a.bandwidth,
      bitrateFormatted: VideoResolutionEngine.formatBitrate(a.bandwidth),
      sampleRateHz: a.audioSamplingRate || 48000,
      channels: 2,
      downloadUrl: manifestUrl,
      isDefault: i === 0,
    }));

    const subtitleTracks: UnifiedSubtitleTrack[] = [];

    const sortedVariants = [...videoVariants].sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps);
    const recommendation = UnifiedMediaModelBuilder.buildRecommendation(sortedVariants as any, audioVariants);
    if (recommendation.recommendedVariant) {
      const match = sortedVariants.find((v) => v.id === recommendation.recommendedVariant?.id);
      if (match) match.isRecommended = true;
    }

    return {
      sourceUrl: manifestUrl,
      pageUrl,
      title: manifestUrl.split('/').pop()?.replace('.mpd', '') || 'DASH Media Manifest',
      deliveryType: 'DASH',
      isLive,
      durationSec: parsed.durationSec,
      formattedDuration: isLive ? 'Live Stream' : parsed.durationSec ? `${Math.floor(parsed.durationSec / 60)}:${String(Math.floor(parsed.durationSec % 60)).padStart(2, '0')}` : 'DASH Stream',
      videoVariants: sortedVariants as any,
      audioVariants,
      subtitleTracks,
      security: {
        isProtected: parsed.isProtected,
        drmSchemes: parsed.drmSchemes,
        protectionReason: parsed.isProtected
          ? `Protected with ${parsed.drmSchemes.join(', ') || 'DRM'}. Cannot bypass technical access control.`
          : undefined,
        requiresAuthorization: parsed.isProtected,
      },
      downloadCapabilities: {
        https: manifestUrl.startsWith('https:'),
        rangeRequests: true,
        resume: !isLive,
        multiConnection: true,
        hls: false,
        dash: true,
        audioSelection: audioVariants.length > 0,
        subtitleSelection: subtitleTracks.length > 0,
        muxing: audioVariants.length > 0,
        drmDetected: parsed.isProtected,
        browserIntegration: true,
      },
      smartRecommendation: recommendation,
      isDownloadable: !parsed.isProtected,
    };
  }
}
