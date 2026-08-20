import { MediaManifestParser, HlsVariantRendition, HlsMediaSegment } from './MediaManifestParser';
import {
  UnifiedMediaResource,
  UnifiedVideoVariant,
  UnifiedAudioVariant,
  UnifiedSubtitleTrack,
  UnifiedMediaModelBuilder,
} from './UnifiedMediaModel';
import { VideoResolutionEngine } from './VideoResolutionEngine';
import { HlsTimeline } from './HlsTimeline';

export class HlsEngine {
  public static isHls(url: string, content?: string): boolean {
    if (url.includes('.m3u8')) return true;
    if (content && (content.includes('#EXTM3U') || content.includes('#EXT-X-VERSION'))) return true;
    return false;
  }

  public static isLiveStream(m3u8Content: string): boolean {
    // If #EXT-X-ENDLIST is missing, it's a live rolling stream
    return !m3u8Content.includes('#EXT-X-ENDLIST');
  }

  public static parseHlsToUnifiedModel(
    m3u8Content: string,
    manifestUrl: string,
    pageUrl: string = manifestUrl
  ): UnifiedMediaResource {
    const isMaster = MediaManifestParser.isMasterPlaylist(m3u8Content);
    const isLive = this.isLiveStream(m3u8Content);

    const isProtected =
      m3u8Content.includes('#EXT-X-KEY:METHOD=SAMPLE-AES') ||
      m3u8Content.includes('#EXT-X-KEY:METHOD=com.apple.fps');

    const videoVariants: UnifiedVideoVariant[] = [];
    const audioVariants: UnifiedAudioVariant[] = [];
    const subtitleTracks: UnifiedSubtitleTrack[] = [];

    let subIdx = 1;
    let audioIdx = 1;

    for (const rawLine of m3u8Content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith('#EXT-X-MEDIA:')) {
        if (line.includes('TYPE=SUBTITLES')) {
          const nameMatch = line.match(/NAME="([^"]+)"/i);
          const langMatch = line.match(/LANGUAGE="([^"]+)"/i);
          const uriMatch = line.match(/URI="([^"]+)"/i);

          if (uriMatch && uriMatch[1]) {
            try {
              const subUrl = new URL(uriMatch[1], manifestUrl).href;
              const lang = langMatch ? langMatch[1] : 'und';
              subtitleTracks.push({
                id: `sub_${subIdx++}`,
                language: lang,
                languageLabel: nameMatch ? nameMatch[1] : lang.toUpperCase(),
                format: 'vtt',
                downloadUrl: subUrl,
              });
            } catch {}
          }
        } else if (line.includes('TYPE=AUDIO')) {
          const nameMatch = line.match(/NAME="([^"]+)"/i);
          const langMatch = line.match(/LANGUAGE="([^"]+)"/i);
          const uriMatch = line.match(/URI="([^"]+)"/i);

          if (uriMatch && uriMatch[1]) {
            try {
              const audioUrl = new URL(uriMatch[1], manifestUrl).href;
              const lang = langMatch ? langMatch[1] : 'und';
              audioVariants.push({
                id: `audio_${audioIdx++}`,
                language: lang,
                languageLabel: nameMatch ? nameMatch[1] : lang === 'en' ? 'English' : lang.toUpperCase(),
                audioCodec: 'AAC',
                bitrateBps: 192000,
                bitrateFormatted: '192 kbps',
                sampleRateHz: 48000,
                channels: 2,
                downloadUrl: audioUrl,
              });
            } catch {}
          }
        }
      }
    }

    let durationSec: number | undefined;

    if (isMaster) {
      const variants = MediaManifestParser.parseMasterPlaylist(m3u8Content, manifestUrl);

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        let width = 1920;
        let height = 1080;

        if (v.resolution) {
          const parts = v.resolution.split('x').map((n) => parseInt(n, 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            width = parts[0];
            height = parts[1];
          }
        } else {
          if (v.bandwidth >= 12000000) { width = 3840; height = 2160; }
          else if (v.bandwidth >= 6000000) { width = 1920; height = 1080; }
          else if (v.bandwidth >= 3000000) { width = 1280; height = 720; }
          else { width = 854; height = 480; }
        }

        const resLabel = VideoResolutionEngine.computeResolutionLabel(width, height);
        const isHdr = Boolean(v.codecs && (v.codecs.includes('hev1') || v.codecs.includes('dvh1') || v.codecs.includes('vp09.02')));
        const sizeEst = VideoResolutionEngine.estimateSize(v.bandwidth, undefined);

        const qualityObj: UnifiedVideoVariant = {
          id: `hls_v_${i + 1}`,
          resolutionLabel: resLabel,
          width,
          height,
          frameRate: v.frameRate || 30,
          bitrateBps: v.bandwidth,
          bitrateFormatted: VideoResolutionEngine.formatBitrate(v.bandwidth),
          videoCodec: v.codecs ? v.codecs.split(',')[0].trim() : 'H.264 / AVC',
          isHdr,
          hdrLabel: isHdr ? 'HDR10' : 'SDR',
          container: 'MP4 / HLS',
          estimatedSizeBytes: sizeEst.sizeBytes,
          formattedSize: sizeEst.formatted,
          isEstimatedSize: true,
          downloadUrl: v.url,
          protocol: 'hls',
          isRecommended: false,
          recommendationScore: 0,
        };

        qualityObj.recommendationScore = VideoResolutionEngine.scoreRecommendation(qualityObj as any);
        videoVariants.push(qualityObj);
      }
    } else {
      const segments = MediaManifestParser.parseMediaPlaylist(m3u8Content, manifestUrl);
      const timeline = HlsTimeline.buildTimeline(segments);
      durationSec = HlsTimeline.getTotalDuration(timeline);

      videoVariants.push({
        id: 'hls_single',
        resolutionLabel: 'Original Quality',
        width: 1920,
        height: 1080,
        bitrateBps: 4500000,
        bitrateFormatted: 'Adaptive Stream',
        videoCodec: 'H.264 / AVC',
        isHdr: false,
        hdrLabel: 'SDR',
        container: 'MPEG-TS / HLS',
        estimatedSizeBytes: durationSec > 0 ? Math.round((4500000 / 8) * durationSec) : undefined,
        formattedSize: durationSec > 0 ? `~${VideoResolutionEngine.formatBytes((4500000 / 8) * durationSec)}` : 'Variable Stream',
        isEstimatedSize: true,
        downloadUrl: manifestUrl,
        protocol: 'hls',
        isRecommended: true,
        recommendationScore: 90,
      });
    }

    // Sort high-to-low quality
    const sortedVariants = [...videoVariants].sort((a, b) => b.height - a.height || b.bitrateBps - a.bitrateBps);
    const recommendation = UnifiedMediaModelBuilder.buildRecommendation(sortedVariants as any, audioVariants);
    if (recommendation.recommendedVariant) {
      const match = sortedVariants.find((v) => v.id === recommendation.recommendedVariant?.id);
      if (match) match.isRecommended = true;
    }

    return {
      sourceUrl: manifestUrl,
      pageUrl,
      title: manifestUrl.split('/').pop()?.replace('.m3u8', '') || 'HLS Video Resource',
      deliveryType: 'HLS',
      isLive,
      durationSec,
      formattedDuration: isLive ? 'Live Stream' : durationSec ? `${Math.floor(durationSec / 60)}:${String(Math.floor(durationSec % 60)).padStart(2, '0')}` : 'Adaptive Stream',
      videoVariants: sortedVariants as any,
      audioVariants,
      subtitleTracks,
      security: {
        isProtected,
        drmSchemes: isProtected ? ['FairPlay / Sample-AES'] : [],
        protectionReason: isProtected ? 'FairPlay or AES sample encryption detected.' : undefined,
        requiresAuthorization: isProtected,
      },
      downloadCapabilities: {
        https: manifestUrl.startsWith('https:'),
        rangeRequests: true,
        resume: !isLive,
        multiConnection: true,
        hls: true,
        dash: false,
        audioSelection: audioVariants.length > 0,
        subtitleSelection: subtitleTracks.length > 0,
        muxing: audioVariants.length > 0,
        drmDetected: isProtected,
        browserIntegration: true,
      },
      smartRecommendation: recommendation,
      isDownloadable: !isProtected,
    };
  }
}
