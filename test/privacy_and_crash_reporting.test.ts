import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { PrivacyCenter } from '../src/main/security/PrivacyCenter';
import { CrashReporter } from '../src/main/diagnostics/CrashReporter';
import { redactUrlCredentials, redactHeaders, redactSettings } from '../src/main/security/Redact';

describe('Privacy Center & Sanitized Crash Reporting', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterEach(() => {
    db.close();
  });

  test('PrivacyCenter returns accurate local-only privacy summary', () => {
    const summary = PrivacyCenter.getPrivacySummary(db);

    expect(summary.externalTelemetryEnabled).toBe(false);
    expect(summary.storedUrlsCount).toBe(0);
    expect(summary.historyRecordsCount).toBe(0);
    expect(summary.telemetryRetentionDays).toBe(30);
  });

  test('PrivacyCenter data wipe permanently cleans all tables with confirmation', () => {
    db.addHistory({
      id: 'h-1',
      downloadId: 'd-1',
      filename: 'file.iso',
      url: 'https://example.com/file.iso',
      domain: 'example.com',
      date: Date.now(),
      durationMs: 1000,
      fileSize: 5000,
      destinationPath: '/home/user/file.iso',
      status: 'completed',
      avgSpeed: 5000,
      peakSpeed: 5000,
      category: 'other',
      queueName: 'default',
    });

    expect(db.getHistory().length).toBe(1);

    // Rejects without correct confirmation phrase
    const badWipe = PrivacyCenter.wipeAllData(db, 'wrong phrase');
    expect(badWipe.success).toBe(false);
    expect(db.getHistory().length).toBe(1);

    // Successfully wipes with exact confirmation phrase
    const goodWipe = PrivacyCenter.wipeAllData(db, 'DELETE ALL G1DM DATA');
    expect(goodWipe.success).toBe(true);
    expect(db.getHistory().length).toBe(0);
  });

  test('Redaction utilities sanitize URLs, headers, and secret keys', () => {
    // Redact embedded URL password
    const dirtyUrl = 'https://admin:mySuperSecretPassword@download.internal.net/iso/build.img';
    const cleanUrl = redactUrlCredentials(dirtyUrl);
    expect(cleanUrl).not.toContain('mySuperSecretPassword');
    expect(cleanUrl).toContain('***REDACTED***');

    // Redact headers
    const dirtyHeaders = {
      'User-Agent': 'Mozilla/5.0',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'Cookie': 'session=abc12345; auth=xyz987',
      'X-G1DM-Key': 'my-custom-key',
    };
    const cleanHeaders = redactHeaders(dirtyHeaders);
    expect(cleanHeaders['Authorization']).toBe('***REDACTED***');
    expect(cleanHeaders['Cookie']).toBe('***REDACTED***');
    expect(cleanHeaders['X-G1DM-Key']).toBe('***REDACTED***');
    expect(cleanHeaders['User-Agent']).toBe('Mozilla/5.0');
  });

  test('CrashReporter generates exportable crash report without leaking secrets', () => {
    const s = db.getSettings();
    s.security.apiKey = 'SUPER_SECRET_KEY';
    db.saveSettings(s);

    const report = CrashReporter.generateExportableCrashReport(db, engine);

    expect(report.appVersion).toBe('4.0.0');
    expect(report.securityAudit.secretsSanitized).toBe(true);
    expect(report.securityAudit.telemetryTransmitted).toBe(false);
    expect(report.sanitizedSettings.security.apiKey).toBe('***REDACTED***');
  });
});
