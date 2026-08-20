import { HlsEngine } from '../src/main/media/HlsEngine';
import { HlsTimeline } from '../src/main/media/HlsTimeline';

describe('Advanced HLS Production Engine', () => {
  it('should parse master playlist with multiple video variants and subtitles', () => {
    const masterM3u8 = `
#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="en",URI="subs/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Spanish",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,LANGUAGE="es",URI="subs/es.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",URI="audio/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=18400000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hev1.1.6.L150.90,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
4k.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6800000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1280x720,FRAME-RATE=30.000,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
720p.m3u8
    `;

    const model = HlsEngine.parseHlsToUnifiedModel(masterM3u8, 'https://cdn.example.com/hls/master.m3u8');
    expect(model.deliveryType).toBe('HLS');
    expect(model.videoVariants.length).toBe(3);
    expect(model.videoVariants[0].resolutionLabel).toBe('2160p');
    expect(model.videoVariants[0].width).toBe(3840);
    expect(model.videoVariants[0].height).toBe(2160);
    expect(model.videoVariants[0].frameRate).toBe(60);
    expect(model.videoVariants[0].isHdr).toBe(true);

    expect(model.subtitleTracks.length).toBe(2);
    expect(model.subtitleTracks[0].language).toBe('en');
    expect(model.subtitleTracks[1].language).toBe('es');

    expect(model.audioVariants.length).toBe(1);
    expect(model.audioVariants[0].language).toBe('en');
  });

  it('should calculate exact timeline durations for HLS media playlists', () => {
    const segments = [
      { index: 1, url: 'seg1.ts', durationSec: 6.0 },
      { index: 2, url: 'seg2.ts', durationSec: 6.0 },
      { index: 3, url: 'seg3.ts', durationSec: 4.5 },
    ];
    const timeline = HlsTimeline.buildTimeline(segments);
    expect(timeline.length).toBe(3);
    expect(timeline[0].startTimeSec).toBe(0);
    expect(timeline[0].endTimeSec).toBe(6);
    expect(timeline[2].startTimeSec).toBe(12);
    expect(timeline[2].endTimeSec).toBe(16.5);
    expect(HlsTimeline.getTotalDuration(timeline)).toBe(16.5);
  });

  it('should identify whether a string or URL is HLS', () => {
    expect(HlsEngine.isHls('https://example.com/playlist.m3u8')).toBe(true);
    expect(HlsEngine.isHls('https://example.com/movie.mp4')).toBe(false);
    expect(HlsEngine.isHls('', '#EXTM3U\n#EXT-X-VERSION:3')).toBe(true);
  });

  it('should handle single rendition media playlists with byte-range segments', () => {
    const brM3u8 = `
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
#EXT-X-BYTERANGE:1048576@0
segment.mp4
#EXT-X-ENDLIST
    `;
    const model = HlsEngine.parseHlsToUnifiedModel(brM3u8, 'https://cdn.example.com/media.m3u8');
    expect(model.videoVariants.length).toBe(1);
    expect(model.isLive).toBe(false);
  });
});
