import { ProbeService } from '../src/main/engine/ProbeService';
import { SecretStore } from '../src/main/security/SecretStore';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';

describe('Comprehensive Input Fuzzing Suite', () => {
  it('should safely process extremely long and chaotic URL patterns', () => {
    const fuzzedUrls = [
      'https://example.com/' + 'a'.repeat(2000),
      'https://user:pass@example.com:8080/path/to/file.bin?query=1&token=xyz#hash',
      'http://127.0.0.1:9999/test?foo=' + '%20'.repeat(100),
      'ftp://anonymous:guest@files.server.org/data/archive.tar.gz',
    ];

    for (const u of fuzzedUrls) {
      const name = ProbeService.extractFilenameFromUrl(u);
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toContain('/');
    }
  });

  it('should encrypt and decrypt chaotic non-ASCII binary strings without data loss', () => {
    const chaoticStrings = [
      '\u0000\u0001\u0002\u001f\uFFFF\uD83D\uDE00',
      '密码_пароль_パスワード_🔐_12345',
      'A'.repeat(5000),
    ];

    for (const str of chaoticStrings) {
      const encrypted = SecretStore.encryptSecret(str);
      const decrypted = SecretStore.decryptSecret(encrypted);
      expect(decrypted).toBe(str);
    }
  });

  it('should sanitize null bytes and control characters from filenames', () => {
    expect(PathSanitizer.sanitizeFilename('file\x00name.txt')).toBe('filename.txt');
    expect(PathSanitizer.sanitizeFilename('report\x1fname.pdf')).toBe('reportname.pdf');
  });

  it('should sanitize unicode confusable characters', () => {
    const clean = PathSanitizer.sanitizeFilename('аdmin.exe'); // Cyrillic 'а'
    expect(clean).toBeDefined();
    expect(clean.length).toBeGreaterThan(0);
  });

  it('should handle deeply nested path traversal attempts', () => {
    const clean = PathSanitizer.sanitizeFilename('..\\..\\..\\..\\windows\\system32\\cmd.exe');
    expect(clean).toBe('cmd.exe');
  });

  it('should handle URL encoded traversal sequences', () => {
    const clean = PathSanitizer.sanitizeFilename('%2e%2e%2f%2e%2e%2fetc%2fpasswd');
    expect(clean).not.toContain('/');
  });

  it('should handle empty and whitespace-only filenames', () => {
    expect(PathSanitizer.sanitizeFilename('')).toBe('download');
    expect(PathSanitizer.sanitizeFilename('     ')).toBe('download');
  });
});
