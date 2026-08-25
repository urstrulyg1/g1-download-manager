import { AppDatabase } from '../db/Database';
import { AppSettings, DownloadQueue, CategoryRule } from '../../shared/types';
import { AutomationRule } from '../automation/RuleEngine';

export interface ExportData {
  version: string;
  exportedAt: number;
  appVersion: string;
  settings: AppSettings;
  queues: DownloadQueue[];
  categories: CategoryRule[];
  rules?: AutomationRule[];
  historyCount: number;
}

export class BackupService {
  public static readonly CURRENT_SCHEMA_VERSION = '4.0.0';
  public static readonly SUPPORTED_SCHEMA_VERSIONS = ['2.0.0', '3.0.0', '4.0.0'];

  /**
   * Generates a sanitized JSON export of user configuration, queues, categories, and rules.
   * Private keys, tokens, and plaintext passwords are never included.
   */
  public static exportData(db: AppDatabase, rules?: AutomationRule[]): ExportData {
    const rawSettings = db.getSettings();

    // Sanitize settings: strip API keys, tokens, proxy passwords
    const sanitizedSettings: AppSettings = JSON.parse(JSON.stringify(rawSettings));
    if (sanitizedSettings.security) {
      sanitizedSettings.security.apiKey = '';
      sanitizedSettings.security.virusTotalApiKey = '';
    }
    if (sanitizedSettings.network) {
      sanitizedSettings.network.proxyPassword = undefined;
    }
    if (sanitizedSettings.remote) {
      sanitizedSettings.remote.telegramBotToken = '';
      sanitizedSettings.remote.discordWebhookUrl = '';
    }
    if (sanitizedSettings.automation && Array.isArray(sanitizedSettings.automation.archivePasswords)) {
      sanitizedSettings.automation.archivePasswords = [];
    }

    const queues = db.getQueues();
    const categories = db.getCategories();
    const history = db.getHistory();

    return {
      version: this.CURRENT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      appVersion: '4.0.0',
      settings: sanitizedSettings,
      queues,
      categories,
      rules: rules ? JSON.parse(JSON.stringify(rules)) : [],
      historyCount: history.length,
    };
  }

  /**
   * Validates and imports data safely across versions (2.x, 3.x, 4.x) into the database.
   * Strictly prevents importing plaintext credentials or tokens.
   */
  public static importData(
    db: AppDatabase,
    payload: any,
    options: {
      overwriteSettings?: boolean;
      overwriteQueues?: boolean;
      overwriteCategories?: boolean;
      overwriteRules?: boolean;
    } = {}
  ): {
    success: boolean;
    importedQueues: number;
    importedCategories: number;
    importedRules: number;
    sourceVersion: string;
    message: string;
  } {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid backup file: payload must be a valid JSON object.');
    }

    if (!payload.version && !payload.appVersion) {
      throw new Error('Invalid backup file: missing schema version.');
    }

    const rawVersion = String(payload.version || payload.appVersion || '2.0.0');
    const majorVersion = rawVersion.split('.')[0];
    if (majorVersion !== '2' && majorVersion !== '3' && majorVersion !== '4') {
      throw new Error(`Unsupported backup version: ${rawVersion}. Supported versions: 2.x, 3.x, 4.x.`);
    }

    let importedQueues = 0;
    let importedCategories = 0;
    let importedRules = 0;

    // 1. Settings import with schema migration and credential sanitization
    if (options.overwriteSettings !== false && payload.settings) {
      const current = db.getSettings();
      const s = payload.settings;

      // Migrate 2.x/3.x setting formats if needed
      const migratedSettings: AppSettings = {
        general: {
          ...current.general,
          ...(s.general || {}),
          theme: s.general?.theme === 'light' ? 'light' : 'dark',
        },
        downloads: {
          ...current.downloads,
          ...(s.downloads || {}),
          maxConcurrentDownloads: Math.max(1, Math.min(32, Number(s.downloads?.maxConcurrentDownloads) || 4)),
          defaultConnectionsPerDownload: Math.max(1, Math.min(32, Number(s.downloads?.defaultConnectionsPerDownload) || 8)),
        },
        network: {
          ...current.network,
          ...(s.network || {}),
          // Never accept external proxy passwords from import payload (preserve local secure secret)
          proxyPassword: current.network.proxyPassword,
        },
        browser: {
          ...current.browser,
          ...(s.browser || {}),
        },
        security: {
          ...current.security,
          ...(s.security || {}),
          // Never accept plaintext API keys or credentials from import payload
          apiKey: current.security.apiKey,
          virusTotalApiKey: current.security.virusTotalApiKey,
        },
        scheduler: {
          ...current.scheduler,
          ...(s.scheduler || {}),
        },
        automation: {
          ...current.automation,
          ...(s.automation || {}),
          // Never accept archive passwords from unencrypted backup
          archivePasswords: current.automation.archivePasswords || [],
        },
        power: {
          ...current.power,
          ...(s.power || {}),
        },
        remote: {
          ...current.remote,
          ...(s.remote || {}),
          telegramBotToken: current.remote.telegramBotToken,
          discordWebhookUrl: current.remote.discordWebhookUrl,
        },
      };

      db.saveSettings(migratedSettings);
    }

    // 2. Queues import with structure normalization
    if (options.overwriteQueues !== false && Array.isArray(payload.queues)) {
      for (const q of payload.queues) {
        if (q && q.id && q.name) {
          const normalizedQueue: DownloadQueue = {
            id: String(q.id),
            name: String(q.name),
            priority: typeof q.priority === 'number' ? q.priority : 2,
            mode: q.mode === 'sequential' ? 'sequential' : 'parallel',
            maxConcurrentDownloads: Math.max(1, Math.min(16, Number(q.maxConcurrentDownloads) || 4)),
            maxConnectionsPerDownload: Math.max(1, Math.min(32, Number(q.maxConnectionsPerDownload) || 8)),
            speedLimitBytesPerSec: Math.max(0, Number(q.speedLimitBytesPerSec) || 0),
            destinationDir: q.destinationDir || db.getSettings().general.defaultDownloadDir,
            status: q.status === 'active' || q.status === 'stopped' || q.status === 'paused' ? q.status : 'stopped',
            schedule: q.schedule || { enabled: false, startTime: '00:00', stopTime: '23:59', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
            downloadIds: Array.isArray(q.downloadIds) ? q.downloadIds : [],
            createdAt: typeof q.createdAt === 'number' ? q.createdAt : Date.now(),
          };
          db.saveQueue(normalizedQueue);
          importedQueues++;
        }
      }
    }

    // 3. Categories import with structure normalization
    if (options.overwriteCategories !== false && Array.isArray(payload.categories)) {
      for (const cat of payload.categories) {
        if (cat && cat.id && cat.name) {
          const normalizedCat: CategoryRule = {
            id: String(cat.id),
            name: String(cat.name),
            icon: String(cat.icon || 'Folder'),
            color: String(cat.color || '#3b82f6'),
            defaultDestination: String(cat.defaultDestination || db.getSettings().general.defaultDownloadDir),
            extensions: Array.isArray(cat.extensions) ? cat.extensions.map(String) : [],
            mimeTypes: Array.isArray(cat.mimeTypes) ? cat.mimeTypes.map(String) : [],
          };
          db.saveCategory(normalizedCat);
          importedCategories++;
        }
      }
    }

    // 4. Rules import count
    if (Array.isArray(payload.rules)) {
      importedRules = payload.rules.length;
    }

    return {
      success: true,
      importedQueues,
      importedCategories,
      importedRules,
      sourceVersion: rawVersion,
      message: `Successfully restored backup from v${rawVersion} (${importedQueues} queue(s), ${importedCategories} category rule(s)).`,
    };
  }
}
