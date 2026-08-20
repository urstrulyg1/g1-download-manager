import { SecretStore } from '../src/main/security/SecretStore';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';

describe('Security & File System Hardening', () => {
  it('should encrypt and decrypt secrets with authenticated AES-256-GCM', () => {
    const secret = 'my_super_secret_proxy_pass_123!';
    const encrypted = SecretStore.encryptSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.includes(':')).toBe(true);

    const decrypted = SecretStore.decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('should redact sensitive tokens and passwords from diagnostic strings', () => {
    const log1 = 'Connecting to proxy with password="superSecretPassword" and bearer eyJhbGciOiJIUzI1NiJ9';
    const redacted = SecretStore.redactString(log1);
    expect(redacted).not.toContain('superSecretPassword');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(redacted).toContain('***REDACTED***');
  });

  it('should sanitize Windows reserved names and unicode anomalies', () => {
    expect(PathSanitizer.sanitizeFilename('CON.txt')).toBe('_CON.txt');
    expect(PathSanitizer.sanitizeFilename('aux.zip')).toBe('_aux.zip');
    expect(PathSanitizer.sanitizeFilename('NUL')).toBe('_NUL');
    expect(PathSanitizer.sanitizeFilename('safe_document_2026.pdf')).toBe('safe_document_2026.pdf');
  });
});
