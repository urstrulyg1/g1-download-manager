import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { SiteGrabber } from '../src/main/grabber/SiteGrabber';
import { MediaDetector } from '../src/main/media/MediaDetector';

describe('Site Grabber & Media Detector', () => {
  const testDir = path.join(__dirname, 'tmp_grabber_test');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Public Archive Mirror</title></head>
            <body>
              <video src="/media/video1.mp4" controls></video>
              <a href="/docs/guide.pdf">Download Guide</a>
              <a href="/archives/data.zip">Download Data</a>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/docs/guide.pdf') {
        const dummyPdf = Buffer.from('%PDF-1.4 Guide Content');
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': dummyPdf.length });
        res.end(dummyPdf);
        return;
      }

      if (req.url === '/archives/data.zip') {
        const dummyZip = Buffer.from('PK\x03\x04 Zip Content');
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': dummyZip.length });
        res.end(dummyZip);
        return;
      }

      if (req.url === '/media/video1.mp4') {
        const dummyVideo = Buffer.from('ftypmp42 Video Stream Payload');
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': dummyVideo.length });
        res.end(dummyVideo);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr: any = server.address();
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    server.close(done);
  });

  it('should detect media streams from webpage HTML', async () => {
    const pageUrl = `http://127.0.0.1:${serverPort}/`;
    const media = await MediaDetector.detectMedia(pageUrl);

    expect(media.title).toBe('Public Archive Mirror');
    expect(media.formats.length).toBeGreaterThanOrEqual(1);
    expect(media.formats.some((f) => f.url.includes('/media/video1.mp4'))).toBe(true);
    expect(media.isProtected).toBe(false);
  });

  it('should crawl webpage, discover assets, and mirror them to disk', async () => {
    const db = new AppDatabase(path.join(testDir, 'grabber.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const grabber = new SiteGrabber(db, engine);

    const project: any = {
      id: 'proj_test_1',
      name: 'Test Mirror',
      startUrl: `http://127.0.0.1:${serverPort}/`,
      maxDepth: 2,
      stayOnDomain: true,
      allowSubdomains: false,
      filters: {
        includeExtensions: ['pdf', 'zip', 'mp4'],
        excludeExtensions: [],
      },
      destinationDir: testDir,
      status: 'idle',
      discoveredUrls: [],
      totalDiscovered: 0,
      totalDownloaded: 0,
      createdAt: Date.now(),
    };

    db.saveGrabberProject(project);
    await grabber.startProject('proj_test_1');

    // Give crawler 1 second to crawl and enqueue assets
    await new Promise((r) => setTimeout(r, 1500));

    const updatedProj = db.getGrabberProjects().find((p) => p.id === 'proj_test_1');
    expect(updatedProj).toBeDefined();
    expect(updatedProj?.totalDiscovered).toBeGreaterThanOrEqual(3);

    await engine.shutdown();
    db.close();
  });
});
