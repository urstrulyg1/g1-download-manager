import { UnifiedMediaModelBuilder, UnifiedVideoVariant, UnifiedAudioVariant } from '../src/main/media/UnifiedMediaModel';

describe('Unified Media Model Builder', () => {
  it('should generate intelligent recommendations based on quality score and storage capacity', () => {
    const variants: UnifiedVideoVariant[] = [
      {
        id: 'v_4k',
        resolutionLabel: '2160p',
        width: 3840,
        height: 2160,
        bitrateBps: 18400000,
        bitrateFormatted: '18.4 Mbps',
        videoCodec: 'HEVC',
        isHdr: true,
        hdrLabel: 'HDR10',
        container: 'MP4',
        estimatedSizeBytes: 4 * 1024 * 1024 * 1024, // 4GB
        formattedSize: '~4.0 GB',
        isEstimatedSize: true,
        downloadUrl: 'https://cdn.example.com/4k.m3u8',
        protocol: 'hls',
        isRecommended: false,
        recommendationScore: 80,
      },
      {
        id: 'v_1080p',
        resolutionLabel: '1080p',
        width: 1920,
        height: 1080,
        bitrateBps: 6800000,
        bitrateFormatted: '6.8 Mbps',
        videoCodec: 'H.264',
        isHdr: false,
        hdrLabel: 'SDR',
        container: 'MP4',
        estimatedSizeBytes: 1.5 * 1024 * 1024 * 1024, // 1.5GB
        formattedSize: '~1.5 GB',
        isEstimatedSize: true,
        downloadUrl: 'https://cdn.example.com/1080.m3u8',
        protocol: 'hls',
        isRecommended: false,
        recommendationScore: 85,
      },
    ];

    const audios: UnifiedAudioVariant[] = [
      {
        id: 'a1',
        language: 'en',
        languageLabel: 'English',
        audioCodec: 'AAC',
        bitrateBps: 192000,
        bitrateFormatted: '192 kbps',
        sampleRateHz: 48000,
        channels: 2,
        downloadUrl: 'https://cdn.example.com/audio.m3u8',
        isDefault: true,
      },
    ];

    const rec = UnifiedMediaModelBuilder.buildRecommendation(variants, audios, 2 * 1024 * 1024 * 1024); // 2GB available storage
    expect(rec.recommendedVariant?.resolutionLabel).toBe('1080p');
    expect(rec.recommendedAudio?.language).toBe('en');
    expect(rec.plainEnglishReason).toContain('Recommended: 1080p');
  });
});
