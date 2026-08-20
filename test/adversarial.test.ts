import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { ProbeService } from '../src/main/engine/ProbeService';

describe('Adversarial HTTP Server & Edge-Cases Test Suite', () => {
  const testDir = path.join(__dirname, 'tmp_adversarial_test');
  let server: http.Server;
  let serverPort: number;

  const testDataSize = 1024 * 1024; // 1 MB
  const originalPayload = Buffer.alloc(testDataSize, 0x41); // 'A's

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      const urlPath = req.url || '/';

      // 1. 429 Throttling Endpoint (throttles first 2 attempts, then succeeds)
      if (urlPath.startsWith('/throttle-429')) {
        const count = parseInt(urlPath.split('?count=')[1] || '0', 10);
        if (count < 2) {
          res.writeHead(429, { 'Retry-After': '1', 'Content-Type': 'text/plain' });
          res.end('Too Many Requests - Rate Limit Exceeded');
          return;
        }
      }

      // 2. 503 Server Overload Endpoint
      if (urlPath === '/server-overload-503') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Service Unavailable');
        return;
      }

      // 3. 401 Authentication Required Endpoint
      if (urlPath === '/auth-required') {
        const auth = req.headers.authorization;
        if (!auth || !auth.includes('Basic')) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Secure"', 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }
        res.writeHead(200, { 'Content-Length': 100, 'Content-Type': 'text/plain' });
        res.end('Authorized content payload');
        return;
      }

      // 4. Redirect Chain (301 -> 302 -> 307 -> final)
      if (urlPath === '/redirect-1') {
        res.writeHead(301, { Location: '/redirect-2' });
        res.end();
        return;
      }
      if (urlPath === '/redirect-2') {
        res.writeHead(302, { Location: '/redirect-final' });
        res.end();
        return;
      }
      if (urlPath === '/redirect-final') {
        res.writeHead(200, { 'Content-Length': 50, 'Content-Type': 'text/plain' });
        res.end('Final redirect destination payload data 2026!');
        return;
      }

      // 5. No Range Support (Single stream 200 OK only)
      if (urlPath === '/no-range-support.dat') {
        res.writeHead(200, {
          'Content-Length': testDataSize,
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'none',
        });
        res.end(originalPayload);
        return;
      }

      // Standard range support endpoint
      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d+)?/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : testDataSize - 1;
          const chunk = originalPayload.subarray(start, end + 1);

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${testDataSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': 'application/octet-stream',
            'ETag': '"stable-etag-v1"',
          });
          res.end(chunk);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Length': testDataSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
      });
      res.end(originalPayload);
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

  it('should follow multi-hop HTTP redirects (301 -> 302 -> final)', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/redirect-1`);
    expect(probe.capabilities.redirectChain.length).toBeGreaterThanOrEqual(3);
    expect(probe.capabilities.redirectChain[probe.capabilities.redirectChain.length - 1]).toContain('/redirect-final');
  });

  it('should detect authentication required (HTTP 401)', async () => {
    const probe = await ProbeService.probe(`http://127.0.0.1:${serverPort}/auth-required`);
    expect(probe.capabilities.authRequired).toBe(true);
    expect(probe.capabilities.httpStatus).toBe(401);
  });

  it('should gracefully fallback to single-stream when Range header is unsupported', async () => {
    const db = new AppDatabase(path.join(testDir, 'adv.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const targetUrl = `http://127.0.0.1:${serverPort}/no-range-support.dat`;
    const item = await engine.addDownload({
      url: targetUrl,
      destinationDir: testDir,
      startImmediately: true,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Single stream timeout')), 10000);
      engine.on('item_completed', (comp) => {
        if (comp.id === item.id) {
          clearTimeout(timeout);
          resolve();
        }
      });
      engine.on('item_error', (err, failed) => {
        if (failed.id === item.id) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });

    const finalPath = path.join(testDir, 'no-range-support.dat');
    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.statSync(finalPath).size).toBe(testDataSize);

    await engine.shutdown();
    db.close();
  });
});
