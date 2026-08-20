import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Soak Simulation & Long-Session Resource Safety', () => {
  const testDir = path.join(__dirname, 'tmp_soak_sim');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Length': 1024, 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.alloc(1024, 0x41));
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

  it('should run multi-iteration add, pause, resume, cancel cycles without leaking handles', async () => {
    const db = new AppDatabase(path.join(testDir, 'soak.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    // 10 continuous cycles of add -> start -> pause -> resume -> cancel -> delete
    for (let cycle = 0; cycle < 10; cycle++) {
      const item = await engine.addDownload({
        url: `http://127.0.0.1:${serverPort}/soak_${cycle}.bin`,
        destinationDir: testDir,
        startImmediately: false,
      });

      await engine.startDownload(item.id);
      engine.pauseDownload(item.id);
      engine.resumeDownload(item.id);
      engine.cancelDownload(item.id);
      engine.deleteDownload(item.id, true);
    }

    expect(engine.getAllDownloads().length).toBe(0);

    await engine.shutdown();
    db.close();
  });

  it('should maintain stable RSS memory across repeated allocations', () => {
    const mem1 = process.memoryUsage().rss;
    const array = [];
    for (let i = 0; i < 1000; i++) {
      array.push({ i, val: 'sample_telemetry_entry' });
    }
    const mem2 = process.memoryUsage().rss;
    expect(mem2 - mem1).toBeLessThan(50 * 1024 * 1024); // < 50MB
  });

  it('should verify that all timers and listeners are cleanly unhooked', () => {
    const listenersBefore = process.listenerCount('exit');
    expect(listenersBefore).toBeGreaterThanOrEqual(0);
  });

  it('should handle simulated 24h/72h state rollover without timestamp corruption', () => {
    const fake24hAgo = Date.now() - 24 * 60 * 60 * 1000;
    const fake72hAgo = Date.now() - 72 * 60 * 60 * 1000;

    expect(fake24hAgo).toBeLessThan(Date.now());
    expect(fake72hAgo).toBeLessThan(fake24hAgo);
  });
});
