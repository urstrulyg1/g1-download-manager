import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Dynamic Segmentation Engine', () => {
  const testDir = path.join(__dirname, 'tmp_dyn_test');
  let server: http.Server;
  let serverPort: number;
  const fileSize = 8 * 1024 * 1024; // 8 MB
  const payload = Buffer.alloc(fileSize);
  for (let i = 0; i < fileSize; i++) {
    payload[i] = (i * 31) % 256;
  }

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d+)?/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunk = payload.subarray(start, end + 1);

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.length,
            'Content-Type': 'application/octet-stream',
            'ETag': '"dyn-etag-8mb"',
          });
          res.end(chunk);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
      });
      res.end(payload);
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

  it('should split 8MB file across multiple concurrent segments and assemble perfectly', async () => {
    const db = new AppDatabase(path.join(testDir, 'dyn.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const targetUrl = `http://127.0.0.1:${serverPort}/large8mb.dat`;
    const item = await engine.addDownload({
      url: targetUrl,
      destinationDir: testDir,
      maxConnections: 8,
      startImmediately: true,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('8MB download timed out')), 20000);
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

    const finalPath = path.join(testDir, 'large8mb.dat');
    expect(fs.existsSync(finalPath)).toBe(true);
    const content = fs.readFileSync(finalPath);
    expect(content.length).toBe(fileSize);
    expect(content.equals(payload)).toBe(true);

    await engine.shutdown();
    db.close();
  });
});
