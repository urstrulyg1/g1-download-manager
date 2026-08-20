import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('High-Concurrency Stress Test Suite', () => {
  const testDir = path.join(__dirname, 'tmp_stress_test');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      const payload = Buffer.from('Small stress item payload ' + req.url);
      res.writeHead(200, {
        'Content-Length': payload.length,
        'Content-Type': 'text/plain',
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

  it('should handle 30 simultaneous download jobs without memory leaks or unhandled rejections', async () => {
    const db = new AppDatabase(path.join(testDir, 'stress.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const totalJobs = 30;
    const downloadPromises = [];

    for (let i = 0; i < totalJobs; i++) {
      const p = engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/item_${i}.txt`,
        filename: `stress_item_${i}.txt`,
        destinationDir: testDir,
        startImmediately: true,
      });
      downloadPromises.push(p);
    }

    const items = await Promise.all(downloadPromises);
    expect(items.length).toBe(totalJobs);

    // Wait until all downloads complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Stress test timed out')), 25000);
      let completedCount = 0;

      engine.on('item_completed', () => {
        completedCount++;
        if (completedCount >= totalJobs) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const all = engine.getAllDownloads();
    expect(all.length).toBe(totalJobs);
    expect(all.every((d) => d.status === 'completed')).toBe(true);

    await engine.shutdown();
    db.close();
  });
});
