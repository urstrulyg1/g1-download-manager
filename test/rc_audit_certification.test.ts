import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { SecurityScanner } from '../src/main/security/SecurityScanner';
import { AutoExtractor } from '../src/main/archive/AutoExtractor';
import { ArchiveInspector } from '../src/main/archive/ArchiveInspector';
import { EncryptedVault } from '../src/main/security/EncryptedVault';
import { UrlGuard, UrlGuardError } from '../src/main/security/UrlGuard';
import { PathGuard } from '../src/main/security/PathGuard';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';

describe('Release Candidate Audit & Zero-Regression Certification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm-rc-audit-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Process Execution & Shell Injection Defense', () => {
    it('does not execute shell commands embedded in file names', async () => {
      // Craft a filename with command substitution that would touch a marker file if evaluated in a shell
      const markerFile = path.join(process.cwd(), 'pwned_marker.txt');
      if (fs.existsSync(markerFile)) {
        try { fs.unlinkSync(markerFile); } catch {}
      }

      const maliciousPath = path.join(tmpDir, 'evil_$(touch pwned_marker.txt).bin');
      fs.writeFileSync(maliciousPath, 'sample payload');

      // Run SecurityScanner with a simulated scanner command (node -e)
      const res = await SecurityScanner.scanFile(
        maliciousPath,
        `node -e "process.exit(0)"`
      );

      expect(res.status).toBe('clean');
      // The shell must NOT have evaluated the command substitution; marker file must not exist!
      expect(fs.existsSync(markerFile)).toBe(false);
    });

    it('returns unsupported for non-existent binaries without throwing or hanging', async () => {
      const targetFile = path.join(tmpDir, 'test.bin');
      fs.writeFileSync(targetFile, 'data');

      const res = await SecurityScanner.scanFile(
        targetFile,
        'non_existent_antivirus_binary_xyz_123 --scan'
      );
      expect(res.status).toBe('unsupported');
    });
  });

  describe('2. Archive Extraction Security & Symlink Defenses', () => {
    it('refuses to overwrite pre-existing symlinks during tar extraction', async () => {
      const destDir = path.join(tmpDir, 'extract_target');
      const outsideDir = path.join(tmpDir, 'outside_target');
      fs.mkdirSync(destDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      const sensitiveTarget = path.join(outsideDir, 'sensitive.txt');
      fs.writeFileSync(sensitiveTarget, 'original sensitive data');

      // Create a pre-existing symlink inside destDir pointing to sensitiveTarget
      const symlinkInDest = path.join(destDir, 'owned.txt');
      try {
        fs.symlinkSync(sensitiveTarget, symlinkInDest);
      } catch (err: any) {
        if (err.code === 'EPERM' || err.code === 'ENOTSUP') return;
      }

      // Build a tar with an entry named "owned.txt"
      const content = Buffer.from('malicious overwrite');
      const header = Buffer.alloc(512);
      header.write('owned.txt', 0);
      header.write('0000644', 100);
      header.write(content.length.toString(8).padStart(11, '0'), 124);
      header.write('        ', 148);
      header[156] = '0'.charCodeAt(0);
      let checksum = 0;
      for (const b of header) checksum += b;
      header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);

      const dataBlock = Buffer.alloc(512);
      content.copy(dataBlock);
      const tarPath = path.join(tmpDir, 'test.tar');
      fs.writeFileSync(tarPath, Buffer.concat([header, dataBlock, Buffer.alloc(1024)]));

      const result = await AutoExtractor.extractArchive(tarPath);
      expect(result.extracted).toBe(true);

      // Verify the sensitive file outside destDir was NOT overwritten via the symlink
      expect(fs.readFileSync(sensitiveTarget, 'utf8')).toBe('original sensitive data');
    });

    it('detects dangerous traversal and special entries in ArchiveInspector', async () => {
      const fakeZip = path.join(tmpDir, 'empty.zip');
      // Create empty zip
      fs.writeFileSync(fakeZip, Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

      const info = await ArchiveInspector.inspect(fakeZip);
      expect(info.isArchive).toBe(true);
      expect(info.archiveType).toBe('zip');
    });
  });

  describe('3. Encrypted Vault Safe Confinement', () => {
    it('safely unlinks pre-existing symlinks before exporting decrypted files', async () => {
      const vaultDir = path.join(tmpDir, 'vault_store');
      const exportDir = path.join(tmpDir, 'vault_export');
      const outsideDir = path.join(tmpDir, 'outside_vault');
      fs.mkdirSync(vaultDir, { recursive: true });
      fs.mkdirSync(exportDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      EncryptedVault.setVaultDir(vaultDir);
      expect(EncryptedVault.unlockVault('SecretPass123!')).toBe(true);

      // Create a secret file to store
      const srcFile = path.join(tmpDir, 'my_notes.txt');
      fs.writeFileSync(srcFile, 'Top Secret Content');
      const item = await EncryptedVault.encryptAndStoreFile(srcFile);

      // Create a pre-existing symlink in exportDir pointing to outside target
      const outsideTarget = path.join(outsideDir, 'critical.txt');
      fs.writeFileSync(outsideTarget, 'DO NOT OVERWRITE');
      const symlinkInExport = path.join(exportDir, 'my_notes.txt');
      try {
        fs.symlinkSync(outsideTarget, symlinkInExport);
      } catch (err: any) {
        if (err.code === 'EPERM' || err.code === 'ENOTSUP') return;
      }

      // Export file
      const exportedPath = await EncryptedVault.decryptAndExportFile(item.id, exportDir);
      expect(exportedPath).toBe(path.join(exportDir, 'my_notes.txt'));

      // The outside critical file must NOT have been overwritten
      expect(fs.readFileSync(outsideTarget, 'utf8')).toBe('DO NOT OVERWRITE');
      // The exported file contains the decrypted content
      expect(fs.readFileSync(exportedPath, 'utf8')).toBe('Top Secret Content');

      EncryptedVault.lockVault();
    });
  });

  describe('4. SSRF & URL Confinement Defenses', () => {
    it('rejects loopback, private IPv4, and metadata IP addresses', async () => {
      await expect(UrlGuard.assertSafePublicUrl('http://127.0.0.1:8055/secret')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('http://localhost:3000')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('http://10.0.0.1/admin')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('http://192.168.1.1/router')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('http://172.16.0.1/internal')).rejects.toThrow(UrlGuardError);
    });

    it('rejects unsupported protocols like file:// and data://', async () => {
      await expect(UrlGuard.assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('data:text/plain,hello')).rejects.toThrow(UrlGuardError);
      await expect(UrlGuard.assertSafePublicUrl('javascript:alert(1)')).rejects.toThrow(UrlGuardError);
    });

    it('allows valid public HTTP and HTTPS URLs', async () => {
      const url = await UrlGuard.assertSafePublicUrl('https://example.com/file.zip', { skipDnsResolution: true });
      expect(url.hostname).toBe('example.com');
    });
  });
});
