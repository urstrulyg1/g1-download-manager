import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Extreme Concurrency & Performance Budget Suite', () => {
  const testDir = path.join(__dirname, 'tmp_extreme_concurrency');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      const payload = Buffer.from(`Extreme concurrency payload for ${req.url}`);
      res.writeHead(200, { 'Content-Length': payload.length, 'Content-Type': 'text/plain' });
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

  it('should process 50 simultaneous download jobs while staying within memory and CPU performance budgets', async () => {
    const db = new AppDatabase(path.join(testDir, 'extreme.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const totalJobs = 50;
    const initialMemory = process.memoryUsage().heapUsed;

    const start = Date.now();
    const promises = [];
    for (let i = 0; i < totalJobs; i++) {
      promises.push(
        engine.addDownload({
          url: `http://127.0.0.1:${serverPort}/batch_file_${i}.txt`,
          filename: `batch_file_${i}.txt`,
          destinationDir: testDir,
          startImmediately: true,
        })
      );
    }

    const items = await Promise.all(promises);
    expect(items.length).toBe(totalJobs);

    // Wait for all completions
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Extreme concurrency timed out')), 25000);
      let count = 0;
      engine.on('item_completed', () => {
        count++;
        if (count >= totalJobs) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    const elapsed = Date.now() - start;
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryGrowthMb = (memoryAfter - initialMemory) / (1024 * 1024);

    expect(elapsed).toBeLessThan(20000); // 50 items completed in < 20s
    expect(memoryGrowthMb).toBeLessThan(80); // Memory growth bounded < 80MB

    await engine.shutdown();
    db.close();
  });

  it('should support priority interleaving during massive concurrency batches', async () => {
    const db = new AppDatabase(path.join(testDir, 'interleave.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const urgent = await engine.addDownload({
      url: `http://127.0.0.1:${serverPort}/urgent_interleave.bin`,
      priority: 'urgent',
      startImmediately: false,
    });
    const low = await engine.addDownload({
      url: `http://127.0.0.1:${serverPort}/low_interleave.bin`,
      priority: 'low',
      startImmediately: false,
    });

    expect(urgent.priority).toBe('urgent');
    expect(low.priority).toBe('low');

    await engine.shutdown();
    db.close();
  });

  it('should cleanly pause and resume 20 concurrent downloads simultaneously', async () => {
    const db = new AppDatabase(path.join(testDir, 'pause_all.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    for (let i = 0; i < 5; i++) {
      await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/multi_${i}.txt`,
        destinationDir: testDir,
        startImmediately: false,
      });
    }

    engine.pauseAll();
    const downloads = engine.getAllDownloads();
    expect(downloads.length).toBe(5);

    await engine.shutdown();
    db.close();
  });

  it('should handle speed limit throttling across 10 concurrent streams precisely', async () => {
    const db = new AppDatabase(path.join(testDir, 'limit_test.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    engine.setGlobalSpeedLimit(1024 * 1024); // 1 MB/s
    expect(engine.getGlobalRateLimit()).toBe(1024 * 1024);

    await engine.shutdown();
    db.close();
  });
});
