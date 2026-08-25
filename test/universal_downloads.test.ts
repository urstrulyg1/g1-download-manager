import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { FilenameResolver } from '../src/main/storage/FilenameResolver';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

/** Regression coverage for the extension-agnostic direct-download path. */
describe('universal downloads', () => {
  const dir = path.join(__dirname, 'tmp_universal_downloads');
  const types = ['mp3', 'mp4', 'zip', 'rar', 'pdf', 'exe', 'dmg', 'iso', 'apk', 'mystery'];

  beforeAll(() => fs.mkdirSync(dir, { recursive: true }));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it.each(types)('keeps an arbitrary direct-file extension (%s) without an allowlist', (extension) => {
    const result = FilenameResolver.resolve({
      url: `https://downloads.example.invalid/releases/Artist – package.${extension}?signed=1`,
      probeFilename: `Artist – package.${extension}`,
      mimeType: 'application/octet-stream',
    });
    expect(result.filename).toBe(`Artist – package.${extension}`);
    expect(result.source).toBe('url');
  });

  it('handles no extension, Unicode, long names, Content-Disposition, and malicious input safely', () => {
    expect(FilenameResolver.resolve({ url: 'https://x/file-without-extension', probeFilename: 'file-without-extension' }).filename).toBe('file-without-extension');
    expect(FilenameResolver.resolve({ url: 'https://x', contentDispositionFilename: '日本語の資料.pdf' }).filename).toBe('日本語の資料.pdf');
    const long = FilenameResolver.resolve({ url: 'https://x', userFilename: `${'x'.repeat(500)}.iso` });
    expect(long.filename.length).toBeLessThanOrEqual(255);
    expect(long.filename.endsWith('.iso')).toBe(true);
    const hostile = FilenameResolver.resolve({ url: 'https://x', userFilename: '../../etc/evil.exe' });
    expect(hostile.filename).toBe('evil.exe');
    expect(hostile.filename).not.toMatch(/[\\/]/);
  });

  it('streams a large direct HTTP payload through the normal engine and reserves duplicate names', async () => {
    const payload = Buffer.alloc(1024 * 1024, 0x47);
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="large-package.custom"',
        'Content-Length': payload.length,
        'Accept-Ranges': 'bytes',
      });
      // Deliberately chunk to verify the downloader does not depend on one body buffer.
      for (let offset = 0; offset < payload.length; offset += 8192) res.write(payload.subarray(offset, offset + 8192));
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const db = new AppDatabase(path.join(dir, `universal-${Date.now()}.db`));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();
    try {
      const first = await engine.addDownload({ url: `http://127.0.0.1:${port}/signed`, destinationDir: dir, startImmediately: false });
      const second = await engine.addDownload({ url: `http://127.0.0.1:${port}/signed`, destinationDir: dir, startImmediately: false });
      expect(first.filename).toBe('large-package.custom');
      expect(second.filename).toBe('large-package (1).custom');
      await new Promise<void>((resolve, reject) => {
        engine.once('item_completed', () => resolve());
        engine.once('item_error', reject);
        engine.startDownload(first.id).catch(reject);
      });
      expect(fs.statSync(path.join(dir, first.filename)).size).toBe(payload.length);
    } finally {
      await engine.shutdown();
      db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30000);
});

describe('canonical DownloadEngine HTTP path', () => {
  const dir = path.join(__dirname, 'tmp_canonical_engine');
  const fixtures = [
    'song.mp3', 'video.mp4', 'archive.zip', 'document.pdf', 'program.exe',
    'disk.iso', 'package.apk', 'image.png', 'unknown.bin',
    'file-without-extension', 'unicode-name文件.mp4',
  ];

  beforeAll(() => fs.mkdirSync(dir, { recursive: true }));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('transfers every direct fixture through HttpDownloader, including redirects and missing headers', async () => {
    const payload = Buffer.alloc(1024 * 1024, 0x47);
    const server = http.createServer((req, res) => {
      const requested = decodeURIComponent((req.url || '/').slice(1));
      if (requested === 'redirect') {
        res.writeHead(302, { Location: '/document.pdf' }); res.end(); return;
      }
      if (!fixtures.includes(requested)) { res.writeHead(404); res.end(); return; }
      const headers: Record<string, string | number> = { 'Content-Length': payload.length };
      // Simulate realistic server combinations: Content-Disposition, octet
      // stream, no Content-Type, and range capability. None are rejected.
      if (requested !== 'unknown.bin') headers['Content-Type'] = requested === 'file-without-extension' ? 'application/octet-stream' : 'application/x-test';
      if (requested !== 'file-without-extension') headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(requested)}`;
      if (requested !== 'unknown.bin') headers['Accept-Ranges'] = 'bytes';
      const range = req.headers.range;
      if (range && requested !== 'unknown.bin') {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        const start = match ? Number(match[1]) : 0;
        const end = match && match[2] ? Math.min(Number(match[2]), payload.length - 1) : payload.length - 1;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${payload.length}`, 'Content-Length': end - start + 1 });
        res.end(payload.subarray(start, end + 1));
      } else {
        res.writeHead(200, headers); res.end(payload);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const db = new AppDatabase(path.join(dir, `canonical-${Date.now()}.db`));
    await db.init();
    const engine = new DownloadEngine(db);
    await engine.init();
    // Instrument the actual worker class—not merely file existence—to prove
    // each direct fixture enters G1DM's canonical transfer worker.
    const { HttpDownloader } = await import('../src/main/engine/HttpDownloader');
    const originalStart = HttpDownloader.prototype.start;
    const workerStarts: string[] = [];
    HttpDownloader.prototype.start = async function(this: any) {
      workerStarts.push(this.item.filename);
      return originalStart.call(this);
    };
    try {
      for (const name of [...fixtures, 'redirect']) {
        const item = await engine.addDownload({ url: `http://127.0.0.1:${port}/${encodeURIComponent(name)}`, destinationDir: dir, startImmediately: false });
        await new Promise<void>((resolve, reject) => {
          const completed = (done: any) => {
            if (done.id !== item.id) return;
            engine.off('item_completed', completed);
            engine.off('item_error', failed);
            resolve();
          };
          const failed = (error: Error, failedItem: any) => {
            if (failedItem?.id !== item.id) return;
            engine.off('item_completed', completed);
            reject(error);
          };
          engine.on('item_completed', completed);
          engine.on('item_error', failed);
          engine.startDownload(item.id).catch((error) => failed(error, item));
        });
        expect(fs.existsSync(item.finalPath)).toBe(true);
      }
      expect(workerStarts).toHaveLength(fixtures.length + 1);
      expect(workerStarts).toEqual(expect.arrayContaining(['song.mp3', 'video.mp4', 'archive.zip', 'document.pdf', 'program.exe', 'disk.iso', 'package.apk', 'image.png', 'unknown.bin', 'file-without-extension', 'unicode-name文件.mp4']));
    } finally {
      HttpDownloader.prototype.start = originalStart;
      await engine.shutdown(); db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30000);
});
