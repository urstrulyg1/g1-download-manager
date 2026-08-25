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
    expect(FilenameResolver.resolve({ url: 'https://x/download', probeFilename: 'download' }).filename).toBe('download.bin');
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
