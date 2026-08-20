import { SyncQueueManager, SyncTargetResource } from '../src/main/engine/SyncQueueManager';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

describe('Advanced Synchronization Queue Manager', () => {
  const testDir = path.join(__dirname, 'tmp_sync_queue');
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    server = http.createServer((req, res) => {
      res.writeHead(200, {
        'ETag': '"synced-v1-etag"',
        'Last-Modified': 'Fri, 21 Aug 2026 10:00:00 GMT',
        'Content-Length': 100,
        'Content-Type': 'text/plain',
      });
      res.end('Sync target content');
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

  it('should identify in-sync vs updated resources and enqueue modified files', async () => {
    const db = new AppDatabase(path.join(testDir, 'sync.db'));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();

    const syncMgr = new SyncQueueManager(engine);

    const resources: SyncTargetResource[] = [
      {
        url: `http://127.0.0.1:${serverPort}/file.txt`,
        localPath: testDir,
        lastKnownEtag: '"synced-v1-etag"', // Matches!
        status: 'NEW',
      },
      {
        url: `http://127.0.0.1:${serverPort}/file2.txt`,
        localPath: testDir,
        lastKnownEtag: '"old_outdated_etag"', // Outdated!
        status: 'NEW',
      },
    ];

    const report = await syncMgr.synchronizeResources('sync_proj_1', resources);
    expect(report.totalChecked).toBe(2);
    expect(report.inSyncCount).toBe(1);
    expect(report.updatedCount).toBe(1);

    await engine.shutdown();
    db.close();
  });
});
