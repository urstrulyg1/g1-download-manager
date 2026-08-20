import { DashEngine } from '../src/main/media/DashEngine';

describe('Advanced Production DASH Engine', () => {
  it('should parse complex DASH MPD manifests into the Unified Media Model', () => {
    const complexMpd = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1H0M0S" type="static">
  <Period id="p0">
    <AdaptationSet mimeType="video/mp4" contentType="video" maxWidth="3840" maxHeight="2160">
      <Representation id="v4k" bandwidth="18400000" width="3840" height="2160" frameRate="60" codecs="hev1.1.6.L150.90" />
      <Representation id="v1080" bandwidth="6800000" width="1920" height="1080" frameRate="30" codecs="avc1.640028" />
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" contentType="audio" lang="en">
      <Representation id="a_en" bandwidth="192000" codecs="mp4a.40.2" audioSamplingRate="48000" />
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" contentType="audio" lang="ja">
      <Representation id="a_ja" bandwidth="192000" codecs="mp4a.40.2" audioSamplingRate="48000" />
    </AdaptationSet>
  </Period>
</MPD>
    `;

    const model = DashEngine.parseDashToUnifiedModel(complexMpd, 'https://cdn.example.com/dash.mpd');
    expect(model.deliveryType).toBe('DASH');
    expect(model.durationSec).toBe(3600);
    expect(model.videoVariants.length).toBe(2);
    expect(model.videoVariants[0].resolutionLabel).toBe('2160p 4K');
    expect(model.videoVariants[0].isHdr).toBe(true);

    expect(model.audioVariants.length).toBe(2);
    expect(model.audioVariants.some((a) => a.language === 'en')).toBe(true);
    expect(model.audioVariants.some((a) => a.language === 'ja')).toBe(true);
  });

  it('should detect when DASH manifest uses dynamic type for live streams', () => {
    const liveMpd = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minBufferTime="PT2S">
  <Period id="live_p">
    <AdaptationSet mimeType="video/mp4" contentType="video">
      <Representation id="v720" bandwidth="3000000" width="1280" height="720" />
    </AdaptationSet>
  </Period>
</MPD>
    `;
    const model = DashEngine.parseDashToUnifiedModel(liveMpd, 'https://cdn.example.com/live.mpd');
    expect(model.isLive).toBe(true);
    expect(model.formattedDuration).toBe('Live Stream');
  });

  it('should parse single representation DASH manifests gracefully', () => {
    const singleMpd = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT5M0S">
  <Period>
    <AdaptationSet mimeType="video/mp4" contentType="video">
      <Representation id="v1" bandwidth="5000000" width="1920" height="1080" codecs="avc1.640028" />
    </AdaptationSet>
  </Period>
</MPD>
    `;
    const model = DashEngine.parseDashToUnifiedModel(singleMpd, 'https://example.com/single.mpd');
    expect(model.videoVariants.length).toBe(1);
    expect(model.videoVariants[0].resolutionLabel).toBe('1080p FHD');
  });

  it('should identify whether a string is a DASH manifest', () => {
    expect(DashEngine.isDash('https://example.com/stream.mpd')).toBe(true);
    expect(DashEngine.isDash('https://example.com/stream.m3u8')).toBe(false);
    expect(DashEngine.isDash('', '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">')).toBe(true);
  });
});
