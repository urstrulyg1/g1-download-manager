import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('Queue Priorities & Execution Modes', () => {
  const testDir = path.join(__dirname, 'tmp_queue_priority');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Length': 50, 'Content-Type': 'text/plain' });
      res.end('Queue test item payload data');
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

  it('should prioritize urgent downloads over normal downloads in queue', async () => {
    const db = new AppDatabase(path.join(testDir, 'q_test.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const lowItem = await engine.addDownload({
      url: `http://127.0.0.1:${serverPort}/low.bin`,
      priority: 'low',
      startImmediately: false,
    });

    const urgentItem = await engine.addDownload({
      url: `http://127.0.0.1:${serverPort}/urgent.bin`,
      priority: 'urgent',
      startImmediately: false,
    });

    expect(lowItem.priority).toBe('low');
    expect(urgentItem.priority).toBe('urgent');

    await engine.shutdown();
    db.close();
  });
});
