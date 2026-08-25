import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { looksLikeStreamingMediaSource } from '../src/main/media/SecureMediaDetector';

/**
 * End-to-end regression tests for the complete filename flow:
 *   URL -> metadata/media detection -> title resolution -> sanitization
 *       -> extension -> queue -> download -> final file -> history.
 *
 * A local HTTP fixture server serves Content-Disposition files, HTML media
 * pages, direct files, and deliberately broken responses so the tests are
 * hermetic (no network, no yt-dlp required).
 */
describe('Filename resolution flow (end-to-end)', () => {
  const testDir = path.join(__dirname, 'tmp_filename_flow');
  let server: http.Server;
  let port: number;
  let db: AppDatabase;
  let engine: DownloadEngine;

  const payload = Buffer.from('G1DM filename-flow test payload');

  beforeAll((done) => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    server = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url.startsWith('/cdn/report')) {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="Quarterly Report 2026.pdf"',
          'Content-Length': payload.length,
        });
        res.end(payload);
        return;
      }

      if (url.startsWith('/cdn/unicode')) {
        // RFC 5987 encoded unicode filename.
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          "Content-Disposition": "attachment; filename*=UTF-8''%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82.pdf",
          'Content-Length': payload.length,
        });
        res.end(payload);
        return;
      }

      if (url.startsWith('/direct/plain-file.zip')) {
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': payload.length,
        });
        res.end(payload);
        return;
      }

      if (url.startsWith('/media/watch')) {
        // Simulates a YouTube/Vimeo-style media page with an OpenGraph title.
        const html = `<!doctype html><html><head>
          <title>My Awesome Video - Example</title>
          <meta property="og:title" content="My Awesome Video">
        </head><body><video src="/direct/plain-file.zip"></video></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (url.startsWith('/broken/no-metadata')) {
        // No Content-Disposition, generic/extensionless path.
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(payload);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      done();
    });
  });

  beforeEach(async () => {
    const dbPath = path.join(testDir, `flow_${Math.random().toString(36).slice(2)}.db`);
    db = new AppDatabase(dbPath);
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterEach(async () => {
    try {
      await engine.shutdown();
    } catch {}
    try {
      db.close();
    } catch {}
  });

  afterAll((done) => {
    server.close(() => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {}
      done();
    });
  });

  function waitFor(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 20000);
      engine.on('item_completed', (c) => {
        if (c.id === id) {
          clearTimeout(t);
          resolve();
        }
      });
      engine.on('item_error', (err, f) => {
        if (f.id === id) {
          clearTimeout(t);
          reject(err);
        }
      });
    });
  }

  it('uses Content-Disposition filename and writes it to disk + history', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/cdn/report?id=1`,
      destinationDir: testDir,
      startImmediately: true,
    });
    expect(item.filename).toBe('Quarterly Report 2026.pdf');
    expect((item as any).filenameSource).toBe('content_disposition');
    await waitFor(item.id);

    const finalPath = path.join(testDir, 'Quarterly Report 2026.pdf');
    expect(fs.existsSync(finalPath)).toBe(true);

    const history = db.getHistory();
    const hist = history.find((h) => h.downloadId === item.id);
    expect(hist).toBeDefined();
    expect(hist!.filename).toBe('Quarterly Report 2026.pdf');
  });

  it('supports unicode (RFC 5987) Content-Disposition filenames', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/cdn/unicode`,
      destinationDir: testDir,
      startImmediately: true,
    });
    expect(item.filename).toBe('Документ.pdf');
    await waitFor(item.id);
    expect(fs.existsSync(path.join(testDir, 'Документ.pdf'))).toBe(true);
  });

  it('falls back to the URL filename and correct extension', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/direct/plain-file.zip`,
      destinationDir: testDir,
      startImmediately: true,
    });
    expect(item.filename).toBe('plain-file.zip');
    expect((item as any).filenameSource).toBe('url');
    await waitFor(item.id);
    expect(fs.existsSync(path.join(testDir, 'plain-file.zip'))).toBe(true);
  });

  it('uses the media/HTML page title instead of a hostname or generic token', async () => {
    // looksLikeStreamingMediaSource should treat an HTML page at /watch as
    // a media page WITHOUT hardcoding "youtube" / "vimeo".
    expect(
      looksLikeStreamingMediaSource(
        `http://127.0.0.1:${port}/media/watch?v=1`,
        { filename: 'watch', mimeType: 'text/html' }
      )
    ).toBe(true);

    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/media/watch?v=1`,
      destinationDir: testDir,
      startImmediately: false,
    });
    expect(item.filename).toBe('My Awesome Video.mp4');
    expect(['media_title', 'page_title']).toContain((item as any).filenameSource);
  });

  it('gracefully falls back to a safe filename when metadata is missing', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/broken/no-metadata`,
      destinationDir: testDir,
      startImmediately: false,
    });
    // Generic basename ("no-metadata") is treated as a URL filename only if
    // meaningful; here it is meaningful so it keeps it. Confirm it never
    // becomes empty / undefined / a traversal path.
    expect(item.filename).toMatch(/\.bin$|\.mp4$/);
    expect(item.filename).not.toContain('/');
    expect(item.filename.length).toBeGreaterThan(0);
  });

  it('sanitizes malicious user-supplied filenames and never escapes the dir', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/direct/plain-file.zip`,
      filename: '../../../etc/evil.sh',
      destinationDir: testDir,
      startImmediately: false,
    });
    // The user-provided path traversal must be flattened to a basename.
    expect(item.filename).not.toContain('/');
    expect(item.filename).not.toContain('\\');
    expect(item.filename).not.toContain('..');
    // The resolved final path must remain inside the destination directory.
    const resolved = path.resolve(item.destinationDir, item.filename);
    expect(resolved.startsWith(path.resolve(testDir))).toBe(true);
  });

  it('handles duplicate filenames safely by renaming', async () => {
    // First download creates the file.
    const a = await engine.addDownload({
      url: `http://127.0.0.1:${port}/cdn/report?dup=1`,
      destinationDir: testDir,
      startImmediately: true,
    });
    await waitFor(a.id);
    expect(fs.existsSync(path.join(testDir, 'Quarterly Report 2026.pdf'))).toBe(true);

    // Second download with the same resolved name should be renamed.
    const b = await engine.addDownload({
      url: `http://127.0.0.1:${port}/cdn/report?dup=2`,
      destinationDir: testDir,
      startImmediately: false,
    });
    expect(b.filename).not.toBe(a.filename);
    expect(b.filename).toMatch(/Quarterly Report 2026 \(\d+\)\.pdf/);
  });

  it('never produces a double extension (.mp4.mp4)', async () => {
    const item = await engine.addDownload({
      url: `http://127.0.0.1:${port}/media/watch?dbl=1`,
      // User supplies a name that already ends in .mp4.
      filename: 'My Awesome Video.mp4',
      destinationDir: testDir,
      startImmediately: false,
    });
    expect(item.filename.endsWith('.mp4.mp4')).toBe(false);
    expect(item.filename).toBe('My Awesome Video.mp4');
  });
});
