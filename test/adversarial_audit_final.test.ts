import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';
import { PathGuard } from '../src/main/security/PathGuard';
import { StorageManager } from '../src/main/storage/StorageManager';
import { AppDatabase } from '../src/main/db/Database';
import { ClipboardMonitor } from '../src/main/clipboard/ClipboardMonitor';

describe('Adversarial Engineering Audit & Boundary Hardening Tests', () => {
  const testRoot = path.join(os.tmpdir(), `g1dm_audit_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const allowedDir = path.join(testRoot, 'allowed_downloads');
  const outsideDir = path.join(testRoot, 'sensitive_system_files');

  beforeAll(() => {
    fs.mkdirSync(allowedDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    PathGuard.setAllowedRoots([allowedDir]);
    PathGuard.setAllowAnywhere(false);
  });

  afterAll(() => {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {}
  });

  describe('1. PathSanitizer & Traversal Defense', () => {
    it('should decode and neutralize URL-encoded traversal sequences', () => {
      expect(PathSanitizer.sanitizeFilename('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBe('passwd');
      expect(PathSanitizer.sanitizeFilename('%252e%252e%252fsecret.txt')).toBe('secret.txt');
      expect(PathSanitizer.sanitizeFilename('..%2f..%2fconfig.json')).toBe('config.json');
    });

    it('should normalize Unicode slash lookalikes into standard boundaries', () => {
      // \u2215 = division slash, \u2044 = fraction slash, \uff0f = fullwidth solidus
      expect(PathSanitizer.sanitizeFilename('subfolder\u2215malicious.sh')).toBe('malicious.sh');
      expect(PathSanitizer.sanitizeFilename('deep\u2044nested\uff0fpayload.exe')).toBe('payload.exe');
    });

    it('should strip trailing dots and spaces that Windows truncates', () => {
      expect(PathSanitizer.sanitizeFilename('innocent.pdf. . ')).toBe('innocent.pdf');
      expect(PathSanitizer.sanitizeFilename('test....')).toBe('test');
    });

    it('should prefix Windows reserved device names with extension variations', () => {
      expect(PathSanitizer.sanitizeFilename('con.txt')).toBe('_con.txt');
      expect(PathSanitizer.sanitizeFilename('AUX.tar.gz')).toBe('_AUX.tar.gz');
      expect(PathSanitizer.sanitizeFilename('NUL')).toBe('_NUL');
      expect(PathSanitizer.sanitizeFilename('com1.dat')).toBe('_com1.dat');
    });

    it('should strictly confine paths in isPathInsideDirectory with canonical realpaths', () => {
      expect(PathSanitizer.isPathInsideDirectory(path.join(allowedDir, 'file.zip'), allowedDir)).toBe(true);
      expect(PathSanitizer.isPathInsideDirectory(path.join(outsideDir, 'file.zip'), allowedDir)).toBe(false);
      expect(PathSanitizer.isPathInsideDirectory(path.join(allowedDir, '../sensitive_system_files'), allowedDir)).toBe(false);
      expect(PathSanitizer.isPathInsideDirectory('', allowedDir)).toBe(false);
      expect(PathSanitizer.isPathInsideDirectory(allowedDir + '\0/escape', allowedDir)).toBe(false);
    });
  });

  describe('2. PathGuard Symlink & Null-Byte Defenses', () => {
    it('should reject paths containing null bytes', () => {
      expect(() => {
        PathGuard.assertSafeLocalPath(`${allowedDir}\0/something`);
      }).toThrow(/null bytes/i);
    });

    it('should permit canonical paths inside allowed roots', () => {
      const valid = path.join(allowedDir, 'movie.mp4');
      expect(PathGuard.assertSafeLocalPath(valid)).toBe(path.resolve(valid));
    });

    it('should reject paths outside allowed roots', () => {
      const invalid = path.join(outsideDir, 'passwords.txt');
      expect(() => {
        PathGuard.assertSafeLocalPath(invalid);
      }).toThrow(/outside the permitted directories/i);
    });

    it('should catch symlink escape attempts pointing outside allowed directory', () => {
      const symlinkPath = path.join(allowedDir, 'symlink_to_outside');
      try {
        fs.symlinkSync(outsideDir, symlinkPath, 'dir');
        const targetInsideSymlink = path.join(symlinkPath, 'stolen_data.txt');
        fs.writeFileSync(path.join(outsideDir, 'stolen_data.txt'), 'secret');

        // PathGuard must catch that the canonical destination is outside allowed roots!
        expect(() => {
          PathGuard.assertSafeLocalPath(targetInsideSymlink);
        }).toThrow(/outside the permitted directories/i);
      } catch (err: any) {
        // If filesystem doesn't support symlinks (e.g. restricted permissions), skip
        if (err.code !== 'EPERM' && err.code !== 'ENOTSUP') {
          throw err;
        }
      }
    });
  });

  describe('3. StorageManager File Deletion Guardrails', () => {
    it('should refuse to delete non-temporary files or files outside allowed roots', () => {
      const sensitiveFile = path.join(outsideDir, 'critical_db.sqlite');
      fs.writeFileSync(sensitiveFile, 'important data');

      const userDoc = path.join(allowedDir, 'my_report.docx');
      fs.writeFileSync(userDoc, 'docx data');

      // Attempt cleaning both
      const result = StorageManager.cleanOrphanedFiles([sensitiveFile, userDoc]);
      expect(result.cleaned).toBe(0);
      expect(fs.existsSync(sensitiveFile)).toBe(true);
      expect(fs.existsSync(userDoc)).toBe(true);
    });

    it('should successfully delete legitimate orphaned temporary files inside allowed roots', () => {
      const tempPart = path.join(allowedDir, 'download_123.part');
      const tempG1dm = path.join(allowedDir, 'download_456.g1dm');
      fs.writeFileSync(tempPart, 'part data');
      fs.writeFileSync(tempG1dm, 'g1dm data');

      const result = StorageManager.cleanOrphanedFiles([tempPart, tempG1dm]);
      expect(result.cleaned).toBe(2);
      expect(fs.existsSync(tempPart)).toBe(false);
      expect(fs.existsSync(tempG1dm)).toBe(false);
    });
  });

  describe('4. Database Concurrent Initialization & Persistence Safety', () => {
    it('should atomically initialize when init() is called concurrently multiple times', async () => {
      const db = new AppDatabase(':memory:');
      
      // Launch 5 concurrent init() calls simultaneously
      const inits = [db.init(), db.init(), db.init(), db.init(), db.init()];
      await Promise.all(inits);

      const settings = db.getSettings();
      expect(settings).toBeDefined();
      expect(settings.general.theme).toBe('dark');

      db.close();
    });

    it('should safely flush without leaving corrupt dangling temporary files', async () => {
      const tempDbPath = path.join(testRoot, 'test_flush.db');
      const db = new AppDatabase(tempDbPath);
      await db.init();

      const settings = db.getSettings();
      settings.general.language = 'es';
      db.saveSettings(settings);
      db.flush();

      expect(fs.existsSync(tempDbPath)).toBe(true);
      
      // Verify no temporary files remain in the folder
      const dirFiles = fs.readdirSync(testRoot);
      const danglingTemps = dirFiles.filter((f) => f.includes('test_flush.db.tmp.'));
      expect(danglingTemps.length).toBe(0);

      db.close();
    });
  });

  describe('5. Clipboard Monitor Privacy & Size Bounds', () => {
    it('should reject non-URL text and avoid emitting url_detected', () => {
      const monitor = new ClipboardMonitor();
      let emitted = false;
      monitor.on('url_detected', () => { emitted = true; });

      const res = monitor.checkClipboardText('My super secret password123!');
      expect(res.isDownloadable).toBe(false);
      expect(res.url).toBeUndefined();
      expect(emitted).toBe(false);
    });

    it('should reject oversized clipboard contents (>2048 chars) for safety', () => {
      const monitor = new ClipboardMonitor();
      const largeText = 'https://example.com/' + 'a'.repeat(3000);
      const res = monitor.checkClipboardText(largeText);
      expect(res.isDownloadable).toBe(false);
    });

    it('should accept valid URLs and strip enclosing quotes or brackets', () => {
      const monitor = new ClipboardMonitor();
      const res = monitor.checkClipboardText('"https://releases.ubuntu.com/22.04/ubuntu-22.04.iso"');
      expect(res.isDownloadable).toBe(true);
      expect(res.url).toBe('https://releases.ubuntu.com/22.04/ubuntu-22.04.iso');
    });
  });
});
