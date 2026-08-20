import { ProbeService } from '../src/main/engine/ProbeService';
import { DashManifestParser } from '../src/main/media/DashManifestParser';
import { MediaManifestParser } from '../src/main/media/MediaManifestParser';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';

describe('Adversarial Fuzzing & Malformed Input Defense Suite', () => {
  describe('Header & Filename Fuzzing', () => {
    it('should withstand malformed Content-Disposition headers without throwing unhandled exceptions', () => {
      const fuzzedHeaders = [
        'attachment; filename=""',
        'attachment; filename="....//..\\//"',
        'attachment; filename*=UTF-8\'\'%FF%FE%00',
        'attachment; filename="CON.aux.NUL.exe"',
        'attachment; filename="' + 'A'.repeat(5000) + '.zip"',
        '',
      ];

      for (const h of fuzzedHeaders) {
        const extracted = ProbeService.extractFilenameFromHeaders(h);
        expect(typeof extracted === 'string' || extracted === null).toBe(true);
      }
    });

    it('should sanitize extreme fuzz filenames safely', () => {
      const fuzzedNames = [
        '\x00\x01\x02\x03\x1f../secret.txt',
        'COM1.PRN.LPT1.zip',
        '   ....   ',
        'foo/bar\\baz?query*colon:pipe|quote"less<greater>',
      ];

      for (const raw of fuzzedNames) {
        const clean = PathSanitizer.sanitizeFilename(raw);
        expect(clean.length).toBeGreaterThan(0);
        expect(clean).not.toContain('..');
        expect(clean).not.toContain('/');
        expect(clean).not.toContain('\\');
      }
    });
  });

  describe('Manifest Fuzzing Defense', () => {
    it('should safely reject corrupt XML and nested manifests without hanging', () => {
      const corruptXmls = [
        '<<<<<<>>>',
        '<MPD mediaPresentationDuration="INVALID_DURATION_STRING">',
        '<?xml version="1.0"?><MPD><Period><AdaptationSet><Representation bandwidth="-100" width="NaN" height="undefined"/></AdaptationSet></Period></MPD>',
        '<MPD>' + '<Period>'.repeat(1000),
      ];

      for (const xml of corruptXmls) {
        const parsed = DashManifestParser.parse(xml, 'https://example.com/manifest.mpd');
        expect(typeof parsed.isDash === 'boolean').toBe(true);
        expect(Array.isArray(parsed.videoRepresentations)).toBe(true);
      }
    });

    it('should safely reject malformed HLS tag sequences', () => {
      const corruptM3u8 = `
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=INVALID,RESOLUTION=NOT_A_NUMBER
#EXTINF:-999.0,
invalid.ts
      `;
      const variants = MediaManifestParser.parseMasterPlaylist(corruptM3u8, 'https://example.com');
      expect(Array.isArray(variants)).toBe(true);
    });
  });
});
