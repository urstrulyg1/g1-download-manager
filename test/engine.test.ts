import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import { TokenBucketRateLimiter } from '../src/main/engine/RateLimiter';
import { ChecksumVerifier } from '../src/main/engine/ChecksumVerifier';
import { ProbeService } from '../src/main/engine/ProbeService';
import { ArchiveInspector } from '../src/main/archive/ArchiveInspector';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { LinkBatchExtractor } from '../src/main/batch/LinkBatchExtractor';
import { DiagnosticsService } from '../src/main/diagnostics/DiagnosticsService';

describe('G1DM Core Engine Suite', () => {
  const testDir = path.join(__dirname, 'tmp_test_data');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('RateLimiter', () => {
    it('should accurately throttle byte transfers', async () => {
      const limiter = new TokenBucketRateLimiter(1024 * 100); // 100 KB/s
      expect(limiter.getLimit()).toBe(1024 * 100);

      const start = Date.now();
      await limiter.acquire(50 * 1024); // 50 KB
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);

      limiter.setLimit(0); // Unlimited
      expect(limiter.getLimit()).toBe(0);
      await limiter.acquire(1024 * 1024);
    });
  });

  describe('ChecksumVerifier', () => {
    it('should compute and verify SHA-256 and MD5 hashes accurately', async () => {
      const sampleFile = path.join(testDir, 'sample_hash_test.bin');
      const data = Buffer.from('G1DM Next-Generation Download Manager Test Payload 2026');
      fs.writeFileSync(sampleFile, data);

      const expectedSha256 = crypto.createHash('sha256').update(data).digest('hex');
      const expectedMd5 = crypto.createHash('md5').update(data).digest('hex');

      const verifiedSha = await ChecksumVerifier.verifyChecksum(sampleFile, {
        algorithm: 'sha256',
        expected: expectedSha256,
        status: 'pending',
      });
      expect(verifiedSha.status).toBe('verified');
      expect(verifiedSha.actual).toBe(expectedSha256);

      const verifiedMd5 = await ChecksumVerifier.verifyChecksum(sampleFile, {
        algorithm: 'md5',
        expected: expectedMd5,
        status: 'pending',
      });
      expect(verifiedMd5.status).toBe('verified');
      expect(verifiedMd5.actual).toBe(expectedMd5);

      const failedSha = await ChecksumVerifier.verifyChecksum(sampleFile, {
        algorithm: 'sha256',
        expected: 'invalid_hash_string',
        status: 'pending',
      });
      expect(failedSha.status).toBe('failed');
    });
  });

  describe('ProbeService', () => {
    it('should sanitize unsafe filenames and path traversals', () => {
      expect(ProbeService.sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(ProbeService.sanitizeFilename('file?foo=bar#baz')).toBe('file');
      expect(ProbeService.sanitizeFilename('report:final<2026>*.pdf')).toBe('report_final_2026__.pdf');
      expect(ProbeService.sanitizeFilename('   ')).toBe('download');
    });

    it('should extract filename from Content-Disposition header', () => {
      const header1 = 'attachment; filename="archive_2026.zip"';
      expect(ProbeService.extractFilenameFromHeaders(header1)).toBe('archive_2026.zip');

      const header2 = "attachment; filename*=UTF-8''document%20final.pdf";
      expect(ProbeService.extractFilenameFromHeaders(header2)).toBe('document final.pdf');
    });

    it('should categorize files correctly', () => {
      expect(ProbeService.categorizeFile('video.mp4')).toBe('video');
      expect(ProbeService.categorizeFile('music.flac')).toBe('audio');
      expect(ProbeService.categorizeFile('document.pdf')).toBe('document');
      expect(ProbeService.categorizeFile('photo.jpg')).toBe('image');
      expect(ProbeService.categorizeFile('data.tar.gz')).toBe('archive');
      expect(ProbeService.categorizeFile('setup.exe')).toBe('program');
      expect(ProbeService.categorizeFile('unknown.xyz')).toBe('other');
    });
  });

  describe('ArchiveInspector', () => {
    it('should safely inspect zip archives without extracting', async () => {
      const zipPath = path.join(testDir, 'test_archive.zip');
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.append('Hello inside zip 1', { name: 'file1.txt' });
        archive.append('Hello inside zip 2 larger content', { name: 'subfolder/file2.txt' });
        archive.finalize();
      });

      const info = await ArchiveInspector.inspect(zipPath);
      expect(info.isArchive).toBe(true);
      expect(info.entryCount).toBe(2);
      expect(info.files.some((f) => f.name === 'file1.txt')).toBe(true);
      expect(info.hasDangerousPath).toBe(false);
    });
  });

  describe('AppDatabase', () => {
    it('should persist and query downloads, queues, categories, and settings', async () => {
      const dbPath = path.join(testDir, 'test_db.db');
      const db = new AppDatabase(dbPath);
      await db.init();

      const item: any = {
        id: 'test_dl_1',
        url: 'https://example.com/test.zip',
        filename: 'test.zip',
        destinationDir: testDir,
        finalPath: path.join(testDir, 'test.zip'),
        tempPath: path.join(testDir, 'test.zip.part'),
        stateFilePath: path.join(testDir, 'test.zip.g1dm'),
        status: 'queued',
        totalBytes: 1048576,
        downloadedBytes: 0,
        progress: 0,
        speed: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        eta: 0,
        category: 'archive',
        queueId: 'default',
        priority: 'normal',
        maxConnections: 4,
        activeConnections: 0,
        speedLimitBytesPerSec: 0,
        error: null,
        retryCount: 0,
        maxRetries: 5,
        createdAt: Date.now(),
        durationMs: 0,
        securityScan: { status: 'unsupported' },
        serverCapabilities: {
          supportsRange: true,
          protocol: 'https',
          authRequired: false,
          redirectChain: [],
          probedAt: Date.now(),
        },
        checksum: { algorithm: 'sha256', status: 'none' },
        logs: [],
        segments: [],
        speedHistory: [],
      };

      db.saveDownload(item);
      const retrieved = db.getDownload('test_dl_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.filename).toBe('test.zip');
      expect(retrieved?.totalBytes).toBe(1048576);

      const all = db.getAllDownloads();
      expect(all.length).toBeGreaterThanOrEqual(1);

      db.deleteDownload('test_dl_1');
      expect(db.getDownload('test_dl_1')).toBeNull();
      db.close();
    });
  });

  describe('LinkBatchExtractor', () => {
    it('should extract URLs from text and HTML', async () => {
      const sampleHtml = `
        <html>
          <body>
            <a href="https://example.com/files/doc.pdf">Document</a>
            <a href="https://example.com/files/video.mp4">Video</a>
            <img src="https://example.com/images/banner.png" />
          </body>
        </html>
      `;
      const candidates = await LinkBatchExtractor.extractFromUrlOrText(sampleHtml);
      expect(candidates.length).toBe(3);
      expect(candidates.some((c) => c.filename === 'doc.pdf' && c.category === 'document')).toBe(true);
      expect(candidates.some((c) => c.filename === 'video.mp4' && c.category === 'video')).toBe(true);
      expect(candidates.some((c) => c.filename === 'banner.png' && c.category === 'image')).toBe(true);
    });
  });

  describe('Real HTTP Server Multi-Connection Download Test', () => {
    let testHttpServer: http.Server;
    let serverPort: number;
    const testFileSize = 2 * 1024 * 1024; // 2 MB
    const dummyPayload = Buffer.alloc(testFileSize);
    for (let i = 0; i < testFileSize; i++) {
      dummyPayload[i] = i % 256;
    }

    beforeAll((done) => {
      testHttpServer = http.createServer((req, res) => {
        const range = req.headers.range;

        if (range) {
          // Parse Range header e.g. bytes=0-1023
          const match = range.match(/bytes=(\d+)-(\d+)?/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : testFileSize - 1;
            const chunk = dummyPayload.subarray(start, end + 1);

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${testFileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunk.length,
              'Content-Type': 'application/octet-stream',
              'ETag': '"test-etag-12345"',
            });
            res.end(chunk);
            return;
          }
        }

        res.writeHead(200, {
          'Content-Length': testFileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': 'application/octet-stream',
          'ETag': '"test-etag-12345"',
        });
        res.end(dummyPayload);
      });

      testHttpServer.listen(0, '127.0.0.1', () => {
        const addr: any = testHttpServer.address();
        serverPort = addr.port;
        done();
      });
    });

    afterAll((done) => {
      testHttpServer.close(done);
    });

    it('should probe server capabilities with Range probe', async () => {
      const targetUrl = `http://127.0.0.1:${serverPort}/testfile.bin`;
      const probe = await ProbeService.probe(targetUrl);

      expect(probe.size).toBe(testFileSize);
      expect(probe.capabilities.supportsRange).toBe(true);
      expect(probe.capabilities.httpStatus).toBe(206);
      expect(probe.filename).toBe('testfile.bin');
    });

    it('should download a 2MB file using dynamic multi-connection segmentation and verify hash', async () => {
      const dbPath = path.join(testDir, 'engine_test_db.db');
      const db = new AppDatabase(dbPath);
      await db.init();

      const engine = new DownloadEngine(db);
      await engine.init();

      const targetUrl = `http://127.0.0.1:${serverPort}/testfile.bin`;
      const downloadItem = await engine.addDownload({
        url: targetUrl,
        destinationDir: testDir,
        maxConnections: 4,
        startImmediately: true,
      });

      expect(downloadItem).toBeDefined();

      // Wait for completion
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Download timed out')), 15000);
        engine.on('item_completed', (completed) => {
          if (completed.id === downloadItem.id) {
            clearTimeout(timeout);
            resolve();
          }
        });
        engine.on('item_error', (err, failed) => {
          if (failed.id === downloadItem.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      const finalFilePath = path.join(testDir, 'testfile.bin');
      expect(fs.existsSync(finalFilePath)).toBe(true);
      expect(fs.statSync(finalFilePath).size).toBe(testFileSize);

      // Verify file contents match dummyPayload exactly
      const downloadedContent = fs.readFileSync(finalFilePath);
      expect(downloadedContent.equals(dummyPayload)).toBe(true);

      await engine.shutdown();
      db.close();
    });
  });
});
