import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { PrivacyCenter } from '../src/main/security/PrivacyCenter';
import { redactUrlCredentials, redactHeaders, redactSettings } from '../src/main/security/Redact';

describe('G1DM Free & Privacy-First Architecture Validation', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.init();
  });

  afterEach(() => {
    db.close();
  });

  test('Privacy defaults: external telemetry is disabled and retention is bounded', () => {
    const summary = PrivacyCenter.getPrivacySummary(db);
    expect(summary.externalTelemetryEnabled).toBe(false);
    expect(summary.telemetryRetentionDays).toBe(30);
  });

  test('Local data isolation: wipeAllData permanently cleans history and downloads with confirmation', () => {
    db.addHistory({
      id: 'h-reg-1',
      downloadId: 'd-reg-1',
      filename: 'privacy-test.iso',
      url: 'https://example.com/privacy-test.iso',
      domain: 'example.com',
      date: Date.now(),
      durationMs: 500,
      fileSize: 1024,
      destinationPath: '/home/user/privacy-test.iso',
      status: 'completed',
      avgSpeed: 2048,
      peakSpeed: 2048,
      category: 'other',
      queueName: 'default',
    });

    expect(db.getHistory().length).toBe(1);

    const wipeResult = PrivacyCenter.wipeAllData(db, 'DELETE ALL G1DM DATA');
    expect(wipeResult.success).toBe(true);
    expect(db.getHistory().length).toBe(0);
  });

  test('Credential sanitization: redacts auth tokens, cookies, apiKeys, and URL credentials', () => {
    const dirtyUrl = 'https://admin:mySecretToken123@example.com/file.zip?token=supersecret';
    const cleanUrl = redactUrlCredentials(dirtyUrl);
    expect(cleanUrl).not.toContain('mySecretToken123');
    expect(cleanUrl).toContain('***REDACTED***');

    const dirtyHeaders = {
      'Authorization': 'Bearer supersecretjwttoken12345',
      'Cookie': 'sessionId=abc123456789; auth=token_secret',
      'X-G1DM-Key': 'private-user-key-999',
      'Accept': 'application/json',
    };
    const cleanHeaders = redactHeaders(dirtyHeaders);
    expect(cleanHeaders['Authorization']).toBe('***REDACTED***');
    expect(cleanHeaders['Cookie']).toBe('***REDACTED***');
    expect(cleanHeaders['X-G1DM-Key']).toBe('***REDACTED***');
    expect(cleanHeaders['Accept']).toBe('application/json');

    const settings = db.getSettings();
    settings.security.apiKey = 'sensitive_api_key_888';
    settings.network.proxyPassword = 'proxy_password_777';
    const cleanSettings = redactSettings(settings);
    expect(cleanSettings.security.apiKey).toBe('***REDACTED***');
    expect(cleanSettings.network.proxyPassword).toBe('***REDACTED***');
  });

  test('Package metadata: open source MIT license and v4.0.0 release', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    expect(pkgJson.version).toBe('4.0.0');
    expect(pkgJson.license).toBe('MIT');
  });

  test('Commercialization guard: zero subscription, license check, or paywall hooks exist in source code', () => {
    const srcDir = path.join(__dirname, '../src');
    const readAllFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(readAllFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = readAllFiles(srcDir);
    const forbiddenPatterns = [
      /isSubscriptionActive/i,
      /checkLicenseKey/i,
      /verifyPurchase/i,
      /requireProPlan/i,
      /paywallModal/i,
      /billingPortal/i,
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
