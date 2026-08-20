import { HlsEngine } from '../src/main/media/HlsEngine';

describe('HLS Live vs VOD Stream Detection', () => {
  it('should detect VOD streams when #EXT-X-ENDLIST tag is present', () => {
    const vodM3u8 = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg1.ts
#EXTINF:6.0,
seg2.ts
#EXT-X-ENDLIST
    `;
    expect(HlsEngine.isLiveStream(vodM3u8)).toBe(false);

    const model = HlsEngine.parseHlsToUnifiedModel(vodM3u8, 'https://cdn.example.com/vod.m3u8');
    expect(model.isLive).toBe(false);
    expect(model.downloadCapabilities.resume).toBe(true);
  });

  it('should detect Live streams when #EXT-X-ENDLIST tag is missing', () => {
    const liveM3u8 = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:1042
#EXTINF:6.0,
live1042.ts
#EXTINF:6.0,
live1043.ts
    `;
    expect(HlsEngine.isLiveStream(liveM3u8)).toBe(true);

    const model = HlsEngine.parseHlsToUnifiedModel(liveM3u8, 'https://cdn.example.com/live.m3u8');
    expect(model.isLive).toBe(true);
    expect(model.formattedDuration).toBe('Live Stream');
  });
});
