import {
  VideoResolutionEngine,
  AnalyzedVideoQuality,
} from '../src/main/media/VideoResolutionEngine';

describe('Video Resolution & Dynamic Quality Engine', () => {
  it('should accurately label resolutions from pixel dimensions', () => {
    expect(VideoResolutionEngine.computeResolutionLabel(3840, 2160)).toBe('2160p');
    expect(VideoResolutionEngine.computeResolutionLabel(2560, 1440)).toBe('1440p');
    expect(VideoResolutionEngine.computeResolutionLabel(1920, 1080)).toBe('1080p');
    expect(VideoResolutionEngine.computeResolutionLabel(1280, 720)).toBe('720p');
    expect(VideoResolutionEngine.computeResolutionLabel(854, 480)).toBe('480p');
    expect(VideoResolutionEngine.computeResolutionLabel(640, 360)).toBe('360p');
  });

  it('should format bitrates and estimate sizes truthfully', () => {
    expect(VideoResolutionEngine.formatBitrate(18400000)).toBe('18.4 Mbps');
    expect(VideoResolutionEngine.formatBitrate(6800000)).toBe('6.8 Mbps');
    expect(VideoResolutionEngine.formatBitrate(192000)).toBe('192 kbps');

    const exact = VideoResolutionEngine.estimateSize(6800000, 100, 104857600);
    expect(exact.isEstimated).toBe(false);
    expect(exact.formatted).toBe('100.0 MB');

    // 6.8 Mbps for 100 seconds = (6,800,000 / 8) * 100 = 85,000,000 bytes (~81 MB)
    const est = VideoResolutionEngine.estimateSize(6800000, 100);
    expect(est.isEstimated).toBe(true);
    expect(est.formatted).toContain('~81');
  });

  it('should sort video qualities based on user preferences', () => {
    const qualities: AnalyzedVideoQuality[] = [
      {
        id: 'q_720p',
        resolutionLabel: '720p',
        width: 1280,
        height: 720,
        bitrateBps: 3200000,
        bitrateFormatted: '3.2 Mbps',
        videoCodec: 'H.264',
        isHdr: false,
        hdrLabel: 'SDR',
        container: 'MP4',
        estimatedSizeBytes: 300000000,
        formattedSize: '~300 MB',
        isEstimatedSize: true,
        downloadUrl: 'https://cdn.example.com/720.m3u8',
        protocol: 'hls',
        isRecommended: false,
        recommendationScore: 70,
      },
      {
        id: 'q_2160p',
        resolutionLabel: '2160p',
        width: 3840,
        height: 2160,
        bitrateBps: 18400000,
        bitrateFormatted: '18.4 Mbps',
        videoCodec: 'HEVC',
        isHdr: true,
        hdrLabel: 'HDR10',
        container: 'MP4',
        estimatedSizeBytes: 1800000000,
        formattedSize: '~1.8 GB',
        isEstimatedSize: true,
        downloadUrl: 'https://cdn.example.com/2160.m3u8',
        protocol: 'hls',
        isRecommended: false,
        recommendationScore: 80,
      },
      {
        id: 'q_1080p',
        resolutionLabel: '1080p',
        width: 1920,
        height: 1080,
        bitrateBps: 6800000,
        bitrateFormatted: '6.8 Mbps',
        videoCodec: 'H.264',
        isHdr: false,
        hdrLabel: 'SDR',
        container: 'MP4',
        estimatedSizeBytes: 600000000,
        formattedSize: '~600 MB',
        isEstimatedSize: true,
        downloadUrl: 'https://cdn.example.com/1080.m3u8',
        protocol: 'hls',
        isRecommended: true,
        recommendationScore: 85,
      },
    ];

    const recommendedSorted = VideoResolutionEngine.sortQualities(qualities, 'RECOMMENDED');
    expect(recommendedSorted[0].resolutionLabel).toBe('1080p');

    const highestSorted = VideoResolutionEngine.sortQualities(qualities, 'HIGHEST_QUALITY');
    expect(highestSorted[0].resolutionLabel).toBe('2160p');

    const smallestSorted = VideoResolutionEngine.sortQualities(qualities, 'SMALLEST_FILE');
    expect(smallestSorted[0].resolutionLabel).toBe('720p');
  });
});
