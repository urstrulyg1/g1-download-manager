import { AppDatabase } from '../src/main/db/Database';
import { BackupService } from '../src/main/backup/BackupService';

describe('G1DM Cross-Version Backup & Restore Compatibility', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.init();
  });

  afterEach(() => {
    db.close();
  });

  test('Exports clean, sanitized backup with zero plaintext tokens or passwords', () => {
    const settings = db.getSettings();
    settings.security.apiKey = 'SECRET_API_KEY_12345';
    settings.security.virusTotalApiKey = 'VT_TOKEN_SECRET';
    settings.network.proxyPassword = 'SUPER_SECRET_PROXY_PASS';
    settings.remote.telegramBotToken = 'TG_BOT_TOKEN_XYZ';
    settings.automation.archivePasswords = ['secret_zip_pwd'];
    db.saveSettings(settings);

    const exported = BackupService.exportData(db);

    expect(exported.version).toBe('4.0.0');
    expect(exported.settings.security.apiKey).toBe('');
    expect(exported.settings.security.virusTotalApiKey).toBe('');
    expect(exported.settings.network.proxyPassword).toBeUndefined();
    expect(exported.settings.remote.telegramBotToken).toBe('');
    expect(exported.settings.automation.archivePasswords).toEqual([]);
  });

  test('Successfully imports G1DM 2.x backup format', () => {
    const v2Backup = {
      version: '2.0.0',
      appVersion: '2.0.0',
      exportedAt: Date.now() - 100000,
      settings: {
        general: { theme: 'dark', defaultDownloadDir: '/home/user/CustomDownloads' },
        downloads: { maxConcurrentDownloads: 6, defaultConnectionsPerDownload: 12 },
      },
      queues: [
        {
          id: 'v2-queue',
          name: 'V2 Restored Queue',
          priority: 1,
          mode: 'parallel',
          maxConcurrentDownloads: 3,
          maxConnectionsPerDownload: 8,
          speedLimitBytesPerSec: 0,
          destinationDir: '/home/user/CustomDownloads',
          status: 'active',
          schedule: { enabled: false },
          downloadIds: [],
          createdAt: Date.now(),
        },
      ],
      categories: [
        {
          id: 'ebooks',
          name: 'E-Books',
          icon: 'Book',
          color: '#10b981',
          defaultDestination: '/home/user/CustomDownloads/Books',
          extensions: ['epub', 'mobi', 'pdf'],
          mimeTypes: ['application/epub+zip'],
        },
      ],
    };

    const result = BackupService.importData(db, v2Backup);
    expect(result.success).toBe(true);
    expect(result.importedQueues).toBe(1);
    expect(result.importedCategories).toBe(1);

    const queues = db.getQueues();
    expect(queues.some((q) => q.id === 'v2-queue')).toBe(true);

    const categories = db.getCategories();
    expect(categories.some((c) => c.id === 'ebooks')).toBe(true);
  });

  test('Successfully imports G1DM 3.x backup format and preserves local credentials', () => {
    // Set a local secret key in DB
    const s = db.getSettings();
    s.security.apiKey = 'LOCAL_HOST_KEY';
    db.saveSettings(s);

    const v3Backup = {
      version: '3.0.0',
      appVersion: '3.0.0',
      exportedAt: Date.now() - 50000,
      settings: {
        general: { theme: 'light', defaultDownloadDir: '/home/user/V3Dir' },
        downloads: { maxConcurrentDownloads: 5 },
        security: { apiKey: 'ATTACKER_INJECTED_KEY' },
      },
      queues: [],
      categories: [],
    };

    const result = BackupService.importData(db, v3Backup);
    expect(result.success).toBe(true);

    // Verify local secret key was NOT overwritten by external payload
    const updatedSettings = db.getSettings();
    expect(updatedSettings.security.apiKey).toBe('LOCAL_HOST_KEY');
    expect(updatedSettings.general.theme).toBe('light');
  });

  test('Rejects invalid backup payloads gracefully', () => {
    expect(() => BackupService.importData(db, null)).toThrow('Invalid backup file');
    expect(() => BackupService.importData(db, {})).toThrow('missing schema version');
    expect(() => BackupService.importData(db, { version: '99.0.0' })).toThrow('Unsupported backup version');
  });
});
