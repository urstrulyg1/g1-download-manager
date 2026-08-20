export interface DashVideoRepresentation {
  id: string;
  bandwidth: number;
  width: number;
  height: number;
  frameRate?: number;
  codecs?: string;
  mimeType: string;
  qualityLabel: string;
  isHdr: boolean;
  initializationUrl?: string;
  mediaTemplate?: string;
  baseUrl: string;
}

export interface DashAudioRepresentation {
  id: string;
  bandwidth: number;
  language?: string;
  audioSamplingRate?: number;
  audioChannels?: number;
  codecs?: string;
  mimeType: string;
  initializationUrl?: string;
  mediaTemplate?: string;
  baseUrl: string;
}

export interface DashManifestParseResult {
  isDash: boolean;
  durationSec?: number;
  isProtected: boolean;
  drmSchemes: string[];
  videoRepresentations: DashVideoRepresentation[];
  audioRepresentations: DashAudioRepresentation[];
}

export class DashManifestParser {
  public static isDashManifest(xmlContent: string): boolean {
    return xmlContent.includes('<MPD') || xmlContent.includes('xmlns="urn:mpeg:dash:schema:mpd:2011"');
  }

  public static parseIso8601Duration(durationStr?: string): number | undefined {
    if (!durationStr) return undefined;
    // Format: PT1H2M30.5S or PT45M or PT120S
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([0-9.]+)S)?/i);
    if (!match) return undefined;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseFloat(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  public static parse(mpdXml: string, baseUrl: string): DashManifestParseResult {
    const isDash = this.isDashManifest(mpdXml);
    if (!isDash) {
      return {
        isDash: false,
        isProtected: false,
        drmSchemes: [],
        videoRepresentations: [],
        audioRepresentations: [],
      };
    }

    // Extract Total Duration
    const durMatch = mpdXml.match(/mediaPresentationDuration="([^"]+)"/i);
    const durationSec = this.parseIso8601Duration(durMatch ? durMatch[1] : undefined);

    // Extract BaseURL if specified inside MPD
    let effectiveBaseUrl = baseUrl;
    const baseMatch = mpdXml.match(/<BaseURL>([^<]+)<\/BaseURL>/i);
    if (baseMatch && baseMatch[1]) {
      try {
        effectiveBaseUrl = new URL(baseMatch[1].trim(), baseUrl).href;
      } catch {}
    }

    // Check DRM / ContentProtection schemes
    const drmSchemes: string[] = [];
    const isProtected =
      mpdXml.includes('<ContentProtection') ||
      mpdXml.includes('urn:mpeg:dash:mp4protection') ||
      mpdXml.includes('edef8ba9-79d6-4ace-a3c8-27dcd51d21ed') || // Widevine
      mpdXml.includes('9a04f079-9840-4286-ab92-e65be0885f95') || // PlayReady
      mpdXml.includes('94ce86fb-07ff-4f43-adb8-93d2fa968ca2'); // FairPlay

    if (mpdXml.includes('edef8ba9-79d6-4ace-a3c8-27dcd51d21ed')) drmSchemes.push('Widevine DRM');
    if (mpdXml.includes('9a04f079-9840-4286-ab92-e65be0885f95')) drmSchemes.push('PlayReady DRM');
    if (mpdXml.includes('94ce86fb-07ff-4f43-adb8-93d2fa968ca2')) drmSchemes.push('FairPlay DRM');
    if (drmSchemes.length === 0 && isProtected) drmSchemes.push('CENC Common Encryption');

    // Parse AdaptationSets
    const videoRepresentations: DashVideoRepresentation[] = [];
    const audioRepresentations: DashAudioRepresentation[] = [];

    // Split by <AdaptationSet ... </AdaptationSet>
    const adaptationSetRegex = /<AdaptationSet([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
    let adaptMatch: RegExpExecArray | null;

    while ((adaptMatch = adaptationSetRegex.exec(mpdXml)) !== null) {
      const adaptAttributes = adaptMatch[1];
      const adaptBody = adaptMatch[2];

      const mimeTypeMatch = adaptAttributes.match(/mimeType="([^"]+)"/i);
      const contentTypeMatch = adaptAttributes.match(/contentType="([^"]+)"/i);
      const langMatch = adaptAttributes.match(/lang="([^"]+)"/i);
      const codecsMatch = adaptAttributes.match(/codecs="([^"]+)"/i);

      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : '';
      const isAudioAdapt = (contentTypeMatch && contentTypeMatch[1] === 'audio') || mimeType.startsWith('audio');
      const isVideoAdapt = (contentTypeMatch && contentTypeMatch[1] === 'video') || mimeType.startsWith('video');

      // Parse Representation tags inside this AdaptationSet
      const repRegex = /<Representation([^>]*)>(?:[\s\S]*?<\/Representation>)?/gi;
      let repMatch: RegExpExecArray | null;

      while ((repMatch = repRegex.exec(adaptBody)) !== null) {
        const repAttrs = repMatch[1];

        const idMatch = repAttrs.match(/\bid="([^"]+)"/i);
        const bandwidthMatch = repAttrs.match(/\bbandwidth="([^"]+)"/i);
        const widthMatch = repAttrs.match(/\bwidth="([^"]+)"/i);
        const heightMatch = repAttrs.match(/\bheight="([^"]+)"/i);
        const frameRateMatch = repAttrs.match(/\bframeRate="([^"]+)"/i);
        const repCodecsMatch = repAttrs.match(/\bcodecs="([^"]+)"/i) || codecsMatch;
        const audioSamplingRateMatch = repAttrs.match(/\baudioSamplingRate="([^"]+)"/i);

        const id = idMatch ? idMatch[1] : `rep_${Math.random().toString(36).substring(2, 6)}`;
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
        const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
        const frameRate = frameRateMatch ? parseFloat(frameRateMatch[1]) : undefined;
        const codecs = repCodecsMatch ? repCodecsMatch[1] : undefined;

        if (isAudioAdapt || (!isVideoAdapt && (audioSamplingRateMatch || (id && id.toLowerCase().includes('audio'))))) {
          audioRepresentations.push({
            id,
            bandwidth,
            language: langMatch ? langMatch[1] : 'und',
            audioSamplingRate: audioSamplingRateMatch ? parseInt(audioSamplingRateMatch[1], 10) : 48000,
            codecs,
            mimeType: mimeType || 'audio/mp4',
            baseUrl: effectiveBaseUrl,
          });
        } else {
          const isHdr = Boolean(codecs && (codecs.includes('hev1') || codecs.includes('dvh1') || codecs.includes('vp09.02')));
          const qualityLabel = height >= 2160 ? '2160p 4K' : height >= 1440 ? '1440p 2K' : height >= 1080 ? '1080p FHD' : height >= 720 ? '720p HD' : height >= 480 ? '480p' : `${height}p`;

          videoRepresentations.push({
            id,
            bandwidth,
            width,
            height,
            frameRate,
            codecs,
            mimeType: mimeType || 'video/mp4',
            qualityLabel,
            isHdr,
            baseUrl: effectiveBaseUrl,
          });
        }
      }
    }

    // Sort video by height descending, then bandwidth descending
    videoRepresentations.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
    audioRepresentations.sort((a, b) => b.bandwidth - a.bandwidth);

    return {
      isDash: true,
      durationSec,
      isProtected,
      drmSchemes,
      videoRepresentations,
      audioRepresentations,
    };
  }
}
