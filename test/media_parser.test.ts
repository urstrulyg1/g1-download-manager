import { MediaManifestParser } from '../src/main/media/MediaManifestParser';

describe('HLS Media Manifest Parser', () => {
  it('should parse master playlists with multi-bitrate variant streams', () => {
    const masterM3u8 = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=842x480,CODECS="avc1.4d401f,mp4a.40.2"
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p.m3u8
    `;

    expect(MediaManifestParser.isMasterPlaylist(masterM3u8)).toBe(true);

    const variants = MediaManifestParser.parseMasterPlaylist(masterM3u8, 'https://cdn.example.com/hls/master.m3u8');
    expect(variants.length).toBe(4);
    expect(variants[0].resolution).toBe('1920x1080'); // Sorted by bandwidth descending
    expect(variants[0].bandwidth).toBe(5000000);
    expect(variants[0].url).toBe('https://cdn.example.com/hls/1080p.m3u8');
  });

  it('should parse media playlists with byte-range and initialization segments', () => {
    const mediaM3u8 = `
#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.000,
#EXT-X-BYTERANGE:1048576@0
segment.mp4
#EXTINF:6.000,
#EXT-X-BYTERANGE:1048576@1048576
segment.mp4
    `;

    expect(MediaManifestParser.isMasterPlaylist(mediaM3u8)).toBe(false);

    const segments = MediaManifestParser.parseMediaPlaylist(mediaM3u8, 'https://cdn.example.com/hls/media.m3u8');
    expect(segments.length).toBe(2);
    expect(segments[0].initSegmentUrl).toBe('https://cdn.example.com/hls/init.mp4');
    expect(segments[0].byteRange?.length).toBe(1048576);
    expect(segments[0].byteRange?.offset).toBe(0);
    expect(segments[1].byteRange?.offset).toBe(1048576);
  });
});
