import { SecureMediaDetector } from '../src/main/media/SecureMediaDetector';
import * as http from 'http';

describe('Secure Video Download & DRM Boundary Enforcement', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/protected.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(`
#EXTM3U
#EXT-X-VERSION:5
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://fps.key.com",KEYFORMAT="com.apple.fps"
#EXTINF:6.0,
seg1.ts
        `);
        return;
      }

      if (req.url === '/public.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(`
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p.m3u8
        `);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const addr: any = server.address();
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should truthfully mark DRM FairPlay / AES sample encrypted media as protected and non-downloadable', async () => {
    const analysis = await SecureMediaDetector.analyze(`http://127.0.0.1:${serverPort}/protected.m3u8`);
    expect(analysis.isProtected).toBe(true);
    expect(analysis.isDownloadable).toBe(false);
    expect(analysis.protectionReason).toContain('FairPlay');
  });

  it('should extract 1080p and 720p qualities from open public HLS master playlist', async () => {
    const analysis = await SecureMediaDetector.analyze(`http://127.0.0.1:${serverPort}/public.m3u8`);
    expect(analysis.isProtected).toBe(false);
    expect(analysis.isDownloadable).toBe(true);
    expect(analysis.availableVideoQualities.length).toBe(2);
    expect(analysis.availableVideoQualities[0].resolutionLabel).toBe('1080p');
    expect(analysis.availableVideoQualities[1].resolutionLabel).toBe('720p');
  });
});
