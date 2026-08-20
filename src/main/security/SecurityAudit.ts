import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../db/Database';
import { SecretStore } from './SecretStore';
import { PathSanitizer } from '../storage/PathSanitizer';

export interface SecurityVulnerability {
  id: string;
  category: 'CREDENTIALS' | 'PERMISSIONS' | 'PATH_TRAVERSAL' | 'NETWORK_TLS' | 'LEAKAGE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  title: string;
  details: string;
  remediation: string;
}

export interface SecurityAuditReport {
  overallScore: number;
  status: 'SECURE' | 'WARNING' | 'VULNERABLE';
  totalChecked: number;
  vulnerabilities: SecurityVulnerability[];
  auditTimestamp: number;
}

export class SecurityAudit {
  public static async runAudit(db: AppDatabase): Promise<SecurityAuditReport> {
    const vulns: SecurityVulnerability[] = [];
    const settings = db.getSettings();
    const downloads = db.getAllDownloads();

    let checksCount = 0;

    // 1. Check Plaintext Credentials in Database
    checksCount++;
    for (const d of downloads) {
      if (d.auth?.password && !d.auth.password.includes(':')) {
        vulns.push({
          id: `plain_pass_${d.id}`,
          category: 'CREDENTIALS',
          severity: 'HIGH',
          title: `Unencrypted password found in download record: ${d.filename}`,
          details: 'Credential was stored in plaintext without AES-256-GCM vault encryption.',
          remediation: 'Encrypt all password fields via SecretStore.',
        });
      }
    }

    // 2. Check Secret Redaction in Logs
    checksCount++;
    for (const d of downloads) {
      for (const log of d.logs) {
        if (log.message.includes('Bearer eyJ') || log.message.includes('password="')) {
          vulns.push({
            id: `log_leak_${d.id}`,
            category: 'LEAKAGE',
            severity: 'HIGH',
            title: `Unredacted token or password in activity logs for: ${d.filename}`,
            details: 'Event log contains unmasked credentials.',
            remediation: 'Apply SecretStore.redactString() to all loggers.',
          });
        }
      }
    }

    // 3. Check TLS Certificate Verification Policy
    checksCount++;
    if (!settings.security.verifySslCertificates) {
      vulns.push({
        id: 'tls_verify_disabled',
        category: 'NETWORK_TLS',
        severity: 'CRITICAL',
        title: 'TLS Certificate Verification Disabled',
        details: 'Disabling certificate verification makes transfers vulnerable to MITM attacks.',
        remediation: 'Re-enable TLS certificate validation in Settings.',
      });
    }

    // 4. Check Path Traversal Defenses
    checksCount++;
    const testUnsafe = PathSanitizer.sanitizeFilename('../../../etc/passwd');
    if (testUnsafe !== 'passwd') {
      vulns.push({
        id: 'path_traversal_defect',
        category: 'PATH_TRAVERSAL',
        severity: 'CRITICAL',
        title: 'Path Traversal Sanitizer Defect',
        details: 'Path traversal dots were not completely removed.',
        remediation: 'Update PathSanitizer implementation.',
      });
    }

    // 5. Download Directory Permissions
    checksCount++;
    if (!fs.existsSync(settings.general.defaultDownloadDir)) {
      try {
        fs.mkdirSync(settings.general.defaultDownloadDir, { recursive: true });
      } catch (err: any) {
        vulns.push({
          id: 'dir_permission_error',
          category: 'PERMISSIONS',
          severity: 'HIGH',
          title: 'Download Directory Inaccessible',
          details: err.message,
          remediation: 'Check write permissions on default download folder.',
        });
      }
    }

    let score = 100;
    for (const v of vulns) {
      if (v.severity === 'CRITICAL') score -= 35;
      else if (v.severity === 'HIGH') score -= 20;
      else if (v.severity === 'MEDIUM') score -= 10;
      else score -= 5;
    }
    score = Math.max(0, Math.min(100, score));

    return {
      overallScore: score,
      status: score >= 85 ? 'SECURE' : score >= 60 ? 'WARNING' : 'VULNERABLE',
      totalChecked: checksCount,
      vulnerabilities: vulns,
      auditTimestamp: Date.now(),
    };
  }
}
