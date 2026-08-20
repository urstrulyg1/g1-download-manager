import { VideoResolutionEngine } from '../src/main/media/VideoResolutionEngine';
import { DashManifestParser } from '../src/main/media/DashManifestParser';
import { MediaManifestParser } from '../src/main/media/MediaManifestParser';

describe('HDR, Frame Rate & Codec Intelligence Suite', () => {
  it('should detect HDR10 / Dolby Vision from video codecs', () => {
    const dashXml = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="hdr_v" bandwidth="15000000" width="3840" height="2160" codecs="hev1.2.4.L153.B0" />
      <Representation id="sdr_v" bandwidth="6000000" width="1920" height="1080" codecs="avc1.640028" />
    </AdaptationSet>
  </Period>
</MPD>
    `;
    const parsed = DashManifestParser.parse(dashXml, 'https://cdn.example.com/dash.mpd');
    expect(parsed.videoRepresentations[0].isHdr).toBe(true);
    expect(parsed.videoRepresentations[1].isHdr).toBe(false);
  });

  it('should extract exact frame rate (60 FPS, 30 FPS, 24 FPS) from HLS and DASH', () => {
    const hls = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,FRAME-RATE=59.940,CODECS="avc1.640028"
60fps.m3u8
    `;
    const variants = MediaManifestParser.parseMasterPlaylist(hls, 'https://cdn.example.com/hls.m3u8');
    expect(variants[0].frameRate).toBe(59.94);
  });
});
