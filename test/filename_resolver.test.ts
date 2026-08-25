import { FilenameResolver } from '../src/main/storage/FilenameResolver';

describe('FilenameResolver — priority chain & safety', () => {
  describe('priority order', () => {
    it('prefers a user-provided filename above all else', () => {
      const r = FilenameResolver.resolve({
        url: 'https://youtube.com/watch?v=abc',
        userFilename: 'My Custom Name.mp4',
        mediaTitle: 'YouTube Video Title',
        contentDispositionFilename: 'server.bin',
        pageTitle: 'Page Title',
        probeFilename: 'watch',
        mimeType: 'text/html',
      });
      expect(r.filename).toBe('My Custom Name.mp4');
      expect(r.source).toBe('user');
    });

    it('uses the media/yt-dlp title when no user name is given (the YouTube bug)', () => {
      const r = FilenameResolver.resolve({
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        userFilename: undefined,
        mediaTitle: 'My Awesome Video',
        contentDispositionFilename: undefined,
        pageTitle: 'My Awesome Video - YouTube',
        probeFilename: 'watch',
        mimeType: 'text/html; charset=utf-8',
        mediaContainer: 'mp4',
      });
      expect(r.filename).toBe('My Awesome Video.mp4');
      expect(r.source).toBe('media_title');
    });

    it('uses the Content-Disposition filename when no media title is available', () => {
      const r = FilenameResolver.resolve({
        url: 'https://cdn.example.com/get/123',
        contentDispositionFilename: 'quarterly-report.pdf',
        probeFilename: 'download',
        mimeType: 'application/pdf',
      });
      expect(r.filename).toBe('quarterly-report.pdf');
      expect(r.source).toBe('content_disposition');
    });

    it('uses the HTML / OpenGraph page title when no media title or CD header', () => {
      const r = FilenameResolver.resolve({
        url: 'https://vimeo.example/123',
        pageTitle: 'A Great Short Film',
        probeFilename: '123',
        mimeType: 'text/html',
        mediaContainer: 'mp4',
      });
      expect(r.filename).toBe('A Great Short Film.mp4');
      expect(r.source).toBe('page_title');
    });

    it('uses the URL filename when nothing higher is available', () => {
      const r = FilenameResolver.resolve({
        url: 'https://files.example.com/archive.zip',
        probeFilename: 'archive.zip',
        mimeType: 'application/zip',
      });
      expect(r.filename).toBe('archive.zip');
      expect(r.source).toBe('url');
    });

    it('falls back safely for an extensionless watch URL with no metadata', () => {
      const r = FilenameResolver.resolve({
        url: 'https://youtube.com/watch?v=xyz',
        probeFilename: 'watch',
        mimeType: 'text/html',
      });
      expect(r.filename).toMatch(/^download\.html$/);
      expect(r.source).toBe('fallback');
    });
  });

  describe('extension handling', () => {
    it('never produces a double .mp4.mp4 extension', () => {
      const r = FilenameResolver.resolve({
        url: 'https://youtu.be/abc',
        mediaTitle: 'My Awesome Video.mp4',
        mediaContainer: 'mp4',
        mimeType: 'video/mp4',
      });
      expect(r.filename).toBe('My Awesome Video.mp4');
      expect(r.filename.endsWith('.mp4.mp4')).toBe(false);
    });

    it('picks up a friendly container label like "MP4 / HLS"', () => {
      const r = FilenameResolver.resolve({
        url: 'https://stream.example.com/live',
        mediaTitle: 'Live Event',
        mediaContainer: 'MP4 / HLS',
        mimeType: 'application/vnd.apple.mpegurl',
      });
      expect(r.ext).toBe('mp4');
      expect(r.filename).toBe('Live Event.mp4');
    });

    it('uses the Content-Type to infer extension', () => {
      const webm = FilenameResolver.resolve({
        url: 'https://v.example/x',
        mediaTitle: 'Clip',
        mimeType: 'video/webm',
      });
      expect(webm.ext).toBe('webm');

      const mp3 = FilenameResolver.resolve({
        url: 'https://a.example/x',
        mediaTitle: 'Song',
        mimeType: 'audio/mpeg',
        isAudio: true,
      });
      expect(mp3.ext).toBe('mp3');
    });

    it('uses a neutral fallback rather than assuming every unknown resource is media', () => {
      const audio = FilenameResolver.resolve({ url: 'https://x/y', isAudio: true, probeFilename: 'y' });
      expect(audio.ext).toBe('bin');
      const unknown = FilenameResolver.resolve({ url: 'https://x/y', probeFilename: 'y' });
      expect(unknown.ext).toBe('bin');
    });

    it('keeps a real extension from the URL filename', () => {
      const r = FilenameResolver.resolve({
        url: 'https://x.example/photo.JPG?size=large',
        probeFilename: 'photo.JPG',
        mimeType: 'image/jpeg',
      });
      expect(r.filename).toBe('photo.JPG');
    });
  });

  describe('generic / hostname stems are not treated as titles', () => {
    it('treats bare hostnames like youtube.com as generic', () => {
      expect(FilenameResolver.isGenericStem('youtube.com')).toBe(true);
      expect(FilenameResolver.isGenericStem('www.youtube.com')).toBe(true);
      expect(FilenameResolver.isGenericStem('player.vimeo.com')).toBe(true);
      expect(FilenameResolver.isGenericStem('My Awesome Video')).toBe(false);
    });

    it('treats common path tokens (watch/play/stream) as generic', () => {
      for (const t of ['watch', 'video', 'stream', 'index', 'download', 'embed']) {
        expect(FilenameResolver.isGenericStem(t)).toBe(true);
      }
    });

    it('honors even a generic user filename over inferred metadata', () => {
      const r = FilenameResolver.resolve({
        url: 'https://youtube.com/watch?v=1',
        userFilename: 'watch',
        mediaTitle: 'Real Title',
        mediaContainer: 'mp4',
      });
      expect(r.filename).toBe('watch.mp4');
      expect(r.source).toBe('user');
    });
  });

  describe('unicode titles', () => {
    it('preserves unicode titles and NFC-normalizes them', () => {
      const r = FilenameResolver.resolve({
        url: 'https://youtube.com/watch?v=u',
        mediaTitle: '日本語タイトル — Naïve Café.mp4',
        mediaContainer: 'mp4',
        mimeType: 'video/mp4',
      });
      expect(r.filename).toBe('日本語タイトル — Naïve Café.mp4');
      // No path separators, no double extension.
      expect(r.filename).not.toContain('/');
      expect(r.filename).not.toContain('\\');
      expect(r.filename.endsWith('.mp4.mp4')).toBe(false);
    });

    it('decodes percent-encoded unicode Content-Disposition filenames', () => {
      // PathSanitizer is exercised with the already-decoded value.
      const r = FilenameResolver.resolve({
        url: 'https://x/f',
        contentDispositionFilename: 'Документ.pdf',
        mimeType: 'application/pdf',
      });
      expect(r.filename).toBe('Документ.pdf');
    });
  });

  describe('malicious filenames cannot escape the download directory', () => {
    const attacks = [
      '../../../etc/passwd',
      '..\\..\\..\\Windows\\System32\\drivers\\etc\\hosts',
      'foo/bar/baz.sh',
      'name\x00with\x01null.mp4',
      'CON',
      'PRN.exe',
      '....//....//secret',
      '/absolute/path/evil.mp4',
      'C:\\\\Windows\\\\win.ini',
      'a'.repeat(400) + '.mp4',
    ];

    for (const bad of attacks) {
      it(`sanitizes hostile input: ${JSON.stringify(bad).slice(0, 40)}`, () => {
        const r = FilenameResolver.resolve({
          url: 'https://example.com/x',
          userFilename: bad,
          mimeType: 'application/octet-stream',
        });
        // Must be a single basename.
        expect(r.filename).not.toContain('/');
        expect(r.filename).not.toContain('\\');
        expect(r.filename).not.toContain('..');
        expect(r.filename).not.toContain('\x00');
        expect(r.filename.length).toBeLessThanOrEqual(255);
        expect(r.filename.length).toBeGreaterThan(0);
      });
    }
  });

  describe('missing metadata gracefully falls back', () => {
    it('handles empty/undefined metadata without throwing', () => {
      const r = FilenameResolver.resolve({ url: 'https://example.com/' });
      expect(r.filename).toBeTruthy();
      expect(r.source).toBe('fallback');
      expect(r.filename).toMatch(/\.bin$/);
    });

    it('never returns an empty filename', () => {
      const r = FilenameResolver.resolve({
        url: 'https://example.com/',
        userFilename: '   ',
        mediaTitle: '   ',
        pageTitle: '',
        probeFilename: '',
        mimeType: '',
      });
      expect(r.filename.length).toBeGreaterThan(0);
    });
  });
});
