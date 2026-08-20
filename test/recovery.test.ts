import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Pause, Resume & Crash Recovery', () => {
  const testDir = path.join(__dirname, 'tmp_rec_test');
  let server: http.Server;
  let serverPort: number;
  const fileSize = 4 * 1024 * 1024; // 4 MB
  const payload = Buffer.alloc(fileSize, 0x5a);

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
            'ETag': '"recovery-etag"',
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

  it('should support pausing and resuming a download seamlessly', async () => {
    const db = new AppDatabase(path.join(testDir, 'rec.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const targetUrl = `http://127.0.0.1:${serverPort}/recoverable.bin`;
    const item = await engine.addDownload({
      url: targetUrl,
      destinationDir: testDir,
      startImmediately: false,
    });

    expect(item.status).toBe('queued');

    // Start then immediately pause
    await engine.startDownload(item.id);
    engine.pauseDownload(item.id);

    const pausedItem = engine.getDownload(item.id);
    expect(pausedItem?.status).toBe('paused');

    // Resume to completion
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Resume timed out')), 15000);
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
      engine.resumeDownload(item.id);
    });

    const finalPath = path.join(testDir, 'recoverable.bin');
    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.statSync(finalPath).size).toBe(fileSize);

    await engine.shutdown();
    db.close();
  });
});
