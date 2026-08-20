import { DashManifestParser } from '../src/main/media/DashManifestParser';

describe('MPEG-DASH MPD Manifest Parser', () => {
  it('should parse ISO 8601 duration strings accurately', () => {
    expect(DashManifestParser.parseIso8601Duration('PT1H2M30S')).toBe(3750);
    expect(DashManifestParser.parseIso8601Duration('PT45M')).toBe(2700);
    expect(DashManifestParser.parseIso8601Duration('PT120S')).toBe(120);
    expect(DashManifestParser.parseIso8601Duration(undefined)).toBeUndefined();
  });

  it('should parse multi-representation video and audio AdaptationSets', () => {
    const sampleMpd = `
<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT42M18S" minBufferTime="PT1.5S" type="static">
  <Period id="0">
    <AdaptationSet mimeType="video/mp4" contentType="video" maxWidth="3840" maxHeight="2160">
      <Representation id="video-2160p" bandwidth="18400000" width="3840" height="2160" frameRate="60" codecs="hev1.1.6.L150.90">
      </Representation>
      <Representation id="video-1080p" bandwidth="6800000" width="1920" height="1080" frameRate="30" codecs="avc1.640028">
      </Representation>
      <Representation id="video-720p" bandwidth="3200000" width="1280" height="720" frameRate="30" codecs="avc1.4d401f">
      </Representation>
      <Representation id="video-480p" bandwidth="1500000" width="854" height="480" frameRate="30" codecs="avc1.4d401e">
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" contentType="audio" lang="en">
      <Representation id="audio-en-192k" bandwidth="192000" audioSamplingRate="48000" codecs="mp4a.40.2">
      </Representation>
      <Representation id="audio-en-128k" bandwidth="128000" audioSamplingRate="44100" codecs="mp4a.40.2">
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>
    `;

    const parsed = DashManifestParser.parse(sampleMpd, 'https://cdn.example.com/dash/manifest.mpd');
    expect(parsed.isDash).toBe(true);
    expect(parsed.durationSec).toBe(2538); // 42m 18s
    expect(parsed.videoRepresentations.length).toBe(4);
    expect(parsed.videoRepresentations[0].qualityLabel).toBe('2160p 4K');
    expect(parsed.videoRepresentations[0].width).toBe(3840);
    expect(parsed.videoRepresentations[0].height).toBe(2160);
    expect(parsed.videoRepresentations[0].isHdr).toBe(true);

    expect(parsed.audioRepresentations.length).toBe(2);
    expect(parsed.audioRepresentations[0].language).toBe('en');
    expect(parsed.audioRepresentations[0].bandwidth).toBe(192000);
    expect(parsed.isProtected).toBe(false);
  });

  it('should detect Widevine and PlayReady ContentProtection DRM in DASH manifests', () => {
    const drmMpd = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
      <Representation id="v1" bandwidth="2000000" width="1280" height="720"/>
    </AdaptationSet>
  </Period>
</MPD>
    `;

    const parsed = DashManifestParser.parse(drmMpd, 'https://secure.example.com/drm.mpd');
    expect(parsed.isProtected).toBe(true);
    expect(parsed.drmSchemes).toContain('Widevine DRM');
  });

  it('should detect FairPlay ContentProtection in DASH manifests', () => {
    const fairplayMpd = `
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2"/>
      <Representation id="v_fp" bandwidth="4000000" width="1920" height="1080"/>
    </AdaptationSet>
  </Period>
</MPD>
    `;
    const parsed = DashManifestParser.parse(fairplayMpd, 'https://secure.example.com/fp.mpd');
    expect(parsed.isProtected).toBe(true);
    expect(parsed.drmSchemes).toContain('FairPlay DRM');
  });

  it('should return isDash false when XML content does not contain MPD schema', () => {
    const notMpd = '<html><body><h1>Not a manifest</h1></body></html>';
    const parsed = DashManifestParser.parse(notMpd, 'https://example.com/page.html');
    expect(parsed.isDash).toBe(false);
  });
});
