import { UnifiedMediaModelBuilder, UnifiedVideoVariant } from '../src/main/media/UnifiedMediaModel';

describe('Storage & Network Quality Recommendations', () => {
  const variants: UnifiedVideoVariant[] = [
    {
      id: 'v_4k',
      resolutionLabel: '2160p',
      width: 3840,
      height: 2160,
      bitrateBps: 18000000,
      bitrateFormatted: '18.0 Mbps',
      videoCodec: 'HEVC',
      isHdr: true,
      hdrLabel: 'HDR10',
      container: 'MP4',
      estimatedSizeBytes: 5 * 1024 * 1024 * 1024, // 5 GB
      formattedSize: '~5.0 GB',
      isEstimatedSize: true,
      downloadUrl: 'https://example.com/4k',
      protocol: 'hls',
      isRecommended: false,
      recommendationScore: 85,
    },
    {
      id: 'v_1080p',
      resolutionLabel: '1080p',
      width: 1920,
      height: 1080,
      bitrateBps: 6000000,
      bitrateFormatted: '6.0 Mbps',
      videoCodec: 'H.264',
      isHdr: false,
      hdrLabel: 'SDR',
      container: 'MP4',
      estimatedSizeBytes: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
      formattedSize: '~1.5 GB',
      isEstimatedSize: true,
      downloadUrl: 'https://example.com/1080',
      protocol: 'hls',
      isRecommended: true,
      recommendationScore: 90,
    },
  ];

  it('should recommend 1080p when free storage (2GB) cannot accommodate 4K (5GB)', () => {
    const rec = UnifiedMediaModelBuilder.buildRecommendation(variants, [], 2 * 1024 * 1024 * 1024); // 2GB free
    expect(rec.recommendedVariant?.resolutionLabel).toBe('1080p');
  });
});
