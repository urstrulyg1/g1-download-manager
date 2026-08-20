import { DeviceProfiles } from '../src/main/media/DeviceProfiles';
import { UnifiedVideoVariant } from '../src/main/media/UnifiedMediaModel';

describe('Device Profiles & Quality Selection Matrix', () => {
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
      downloadUrl: 'https://example.com/4k',
      protocol: 'hls',
      isRecommended: false,
      recommendationScore: 80,
      formattedSize: '~4 GB',
      isEstimatedSize: true,
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
      downloadUrl: 'https://example.com/1080',
      protocol: 'hls',
      isRecommended: true,
      recommendationScore: 90,
      formattedSize: '~1.5 GB',
      isEstimatedSize: true,
    },
    {
      id: 'v_720p',
      resolutionLabel: '720p',
      width: 1280,
      height: 720,
      bitrateBps: 3000000,
      bitrateFormatted: '3.0 Mbps',
      videoCodec: 'H.264',
      isHdr: false,
      hdrLabel: 'SDR',
      container: 'MP4',
      downloadUrl: 'https://example.com/720',
      protocol: 'hls',
      isRecommended: false,
      recommendationScore: 70,
      formattedSize: '~800 MB',
      isEstimatedSize: true,
    },
  ];

  it('should select 4K HDR for TV_4K profile and 720p/1080p for Mobile profile', () => {
    const tvChoice = DeviceProfiles.selectForProfile(variants, 'TV_4K');
    expect(tvChoice?.resolutionLabel).toBe('2160p');
    expect(tvChoice?.isHdr).toBe(true);

    const mobileChoice = DeviceProfiles.selectForProfile(variants, 'MOBILE');
    expect(mobileChoice?.resolutionLabel).toBe('720p');

    const archiveChoice = DeviceProfiles.selectForProfile(variants, 'ARCHIVE');
    expect(archiveChoice?.resolutionLabel).toBe('2160p');
  });
});
