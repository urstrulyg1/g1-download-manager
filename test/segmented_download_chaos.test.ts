import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { HttpDownloader } from '../src/main/engine/HttpDownloader';
import { DownloadItem } from '../src/shared/types';

describe('Segmented Download Engine Hostile Chaos Testing', () => {
  let server: http.Server;
  let serverPort: number;
  let tempDir: string;
  let testFileBuffer: Buffer;
  let expectedSha256: string;
  let failCountPerSegment: Map<number, number> = new Map();

  beforeAll((done) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm_chaos_test_'));

    // Generate 4MB deterministic test file buffer
    testFileBuffer = Buffer.alloc(4 * 1024 * 1024);
    for (let i = 0; i < testFileBuffer.length; i++) {
      testFileBuffer[i] = (i * 31 + 17) & 0xff;
    }
    expectedSha256 = crypto.createHash('sha256').update(testFileBuffer).digest('hex');

    // Hostile Chaos Test Server
    server = http.createServer((req, res) => {
      const rangeHeader = req.headers.range;

      if (req.url === '/chaos-file.bin') {
        if (!rangeHeader) {
          res.writeHead(200, {
            'Content-Length': testFileBuffer.length,
            'Content-Type': 'application/octet-stream',
            'Accept-Ranges': 'bytes',
          });
          res.end(testFileBuffer);
          return;
        }

        // Parse Range: bytes=start-end
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
          res.writeHead(416, { 'Content-Range': `bytes */${testFileBuffer.length}` });
          res.end();
          return;
        }

        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : testFileBuffer.length - 1;
        const segmentId = Math.floor(start / (512 * 1024)); // Roughly segment index

        const currentFails = failCountPerSegment.get(segmentId) || 0;

        // CHAOS SIMULATION:
        // Segment 2: Fails with HTTP 503 on first try, then succeeds
        if (segmentId === 2 && currentFails === 0) {
          failCountPerSegment.set(segmentId, 1);
          res.writeHead(503, { 'Retry-After': '1', 'Content-Type': 'text/plain' });
          res.end('Chaos: 503 Service Temporarily Unavailable');
          return;
        }

        // Segment 3: Fails with HTTP 429 Too Many Requests on first try
        if (segmentId === 3 && currentFails === 0) {
          failCountPerSegment.set(segmentId, 1);
          res.writeHead(429, { 'Retry-After': '1', 'Content-Type': 'text/plain' });
          res.end('Chaos: 429 Rate Limit Exceeded');
          return;
        }

        // Segment 4: Socket abruptly destroyed after partial bytes
        if (segmentId === 4 && currentFails === 0) {
          failCountPerSegment.set(segmentId, 1);
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${testFileBuffer.length}`,
            'Content-Length': end - start + 1,
            'Content-Type': 'application/octet-stream',
            'Accept-Ranges': 'bytes',
          });
          // Send 1KB then destroy socket
          res.write(testFileBuffer.slice(start, start + 1024));
          setTimeout(() => {
            req.destroy();
          }, 20);
          return;
        }

        // Normal 206 Partial Content
        const chunk = testFileBuffer.slice(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${testFileBuffer.length}`,
          'Content-Length': chunk.length,
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes',
        });
        res.end(chunk);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    server.close(done);
  });

  beforeEach(() => {
    failCountPerSegment.clear();
  });

  test('Survives 429, 503, dropped sockets and completes with 100% byte-for-byte SHA-256 match', async () => {
    const finalFile = path.join(tempDir, 'chaos-downloaded.bin');
    const tempFile = path.join(tempDir, 'chaos-downloaded.bin.part');
    const stateFile = path.join(tempDir, 'chaos-downloaded.bin.g1dm');

    const downloadItem: DownloadItem = {
      id: 'dl-chaos-1',
      url: `http://127.0.0.1:${serverPort}/chaos-file.bin`,
      filename: 'chaos-downloaded.bin',
      destinationDir: tempDir,
      finalPath: finalFile,
      tempPath: tempFile,
      stateFilePath: stateFile,
      status: 'queued',
      totalBytes: testFileBuffer.length,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category: 'other',
      queueId: 'default',
      priority: 'high',
      maxConnections: 8,
      activeConnections: 0,
      speedLimitBytesPerSec: 0,
      retryCount: 0,
      maxRetries: 5,
      createdAt: Date.now(),
      durationMs: 0,
      segments: [],
      speedHistory: [],
      checksum: undefined,
      error: null,
      securityScan: undefined,
      serverCapabilities: {
        supportsRange: true,
        redirectChain: [`http://127.0.0.1:${serverPort}/chaos-file.bin`],
        protocol: 'http',
        authRequired: false,
        probedAt: Date.now(),
      },
      logs: [],
    };

    const downloader = new HttpDownloader(downloadItem);

    await new Promise<void>((resolve, reject) => {
      downloader.on('completed', () => resolve());
      downloader.on('error', (err) => reject(err));
      downloader.start().catch(reject);
    });

    expect(fs.existsSync(finalFile)).toBe(true);
    const downloadedData = fs.readFileSync(finalFile);
    expect(downloadedData.length).toBe(testFileBuffer.length);

    const actualSha256 = crypto.createHash('sha256').update(downloadedData).digest('hex');
    expect(actualSha256).toBe(expectedSha256);
  });
});
