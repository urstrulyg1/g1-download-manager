import { HlsEngine } from '../src/main/media/HlsEngine';

describe('Audio Language & Subtitle Track Selection Suite', () => {
  const sampleM3u8 = `
#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,LANGUAGE="en",URI="subs/en.vtt"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Japanese",DEFAULT=NO,LANGUAGE="ja",URI="subs/ja.vtt"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English AAC",DEFAULT=YES,LANGUAGE="en",URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Japanese E-AC3",DEFAULT=NO,LANGUAGE="ja",URI="audio/ja.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"
video.m3u8
  `;

  it('should detect distinct audio languages and codecs truthfully', () => {
    const model = HlsEngine.parseHlsToUnifiedModel(sampleM3u8, 'https://cdn.example.com/hls.m3u8');
    expect(model.audioVariants.length).toBe(2);
    expect(model.audioVariants[0].language).toBe('en');
    expect(model.audioVariants[1].language).toBe('ja');
  });

  it('should detect WebVTT subtitle tracks and download links', () => {
    const model = HlsEngine.parseHlsToUnifiedModel(sampleM3u8, 'https://cdn.example.com/hls.m3u8');
    expect(model.subtitleTracks.length).toBe(2);
    expect(model.subtitleTracks[0].format).toBe('vtt');
    expect(model.subtitleTracks[0].downloadUrl).toContain('subs/en.vtt');
    expect(model.subtitleTracks[1].downloadUrl).toContain('subs/ja.vtt');
  });
});
