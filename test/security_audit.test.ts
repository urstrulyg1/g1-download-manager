import { SecurityAudit } from '../src/main/security/SecurityAudit';
import { SecretStore } from '../src/main/security/SecretStore';
import { AppDatabase } from '../src/main/db/Database';
import * as path from 'path';
import * as fs from 'fs';

describe('Security Audit & Zero Secret Leak Suite', () => {
  const testDir = path.join(__dirname, 'tmp_sec_audit');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should run security audit across DB, filesystem, and configuration', async () => {
    const db = new AppDatabase(path.join(testDir, 'audit.db'));
    await db.init();

    const report = await SecurityAudit.runAudit(db);
    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.status).toBe('SECURE');
    expect(report.totalChecked).toBeGreaterThanOrEqual(4);

    db.close();
  });

  it('should guarantee zero secret leakage in logs and diagnostics', () => {
    const syntheticSecrets = [
      'password="superSecretPass99!"',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token_payload',
      'Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM=',
    ];

    for (const secretStr of syntheticSecrets) {
      const redacted = SecretStore.redactString(secretStr);
      expect(redacted).not.toContain('superSecretPass99!');
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redacted).not.toContain('dXNlcm5hbWU6cGFzc3dvcmQxMjM=');
      expect(redacted).toContain('***REDACTED***');
    }
  });
});
