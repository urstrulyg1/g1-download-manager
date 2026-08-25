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
  public static readonly CURRENT_SCHEMA_VERSION = '3.0.0';

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

    const queues = db.getQueues();
    const categories = db.getCategories();
    const history = db.getHistory();

    return {
      version: this.CURRENT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      appVersion: '3.0.0',
      settings: sanitizedSettings,
      queues,
      categories,
      rules: rules ? JSON.parse(JSON.stringify(rules)) : [],
      historyCount: history.length,
    };
  }

  /**
   * Validates and imports data safely into the database.
   */
  public static importData(
    db: AppDatabase,
    payload: any,
    options: { overwriteSettings?: boolean; overwriteQueues?: boolean; overwriteCategories?: boolean } = {}
  ): { success: boolean; importedQueues: number; importedCategories: number; message: string } {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid backup file: payload must be a valid JSON object.');
    }

    if (!payload.version) {
      throw new Error('Invalid backup file: missing schema version.');
    }

    let importedQueues = 0;
    let importedCategories = 0;

    // 1. Settings import
    if (options.overwriteSettings !== false && payload.settings) {
      const current = db.getSettings();
      // Merge with current settings to preserve local secret keys
      const merged: AppSettings = {
        general: { ...current.general, ...(payload.settings.general || {}) },
        downloads: { ...current.downloads, ...(payload.settings.downloads || {}) },
        network: {
          ...current.network,
          ...(payload.settings.network || {}),
          proxyPassword: current.network.proxyPassword, // preserve local secret
        },
        browser: { ...current.browser, ...(payload.settings.browser || {}) },
        security: {
          ...current.security,
          ...(payload.settings.security || {}),
          apiKey: current.security.apiKey, // preserve local secret
          virusTotalApiKey: current.security.virusTotalApiKey,
        },
        scheduler: { ...current.scheduler, ...(payload.settings.scheduler || {}) },
        automation: { ...current.automation, ...(payload.settings.automation || {}) },
        power: { ...current.power, ...(payload.settings.power || {}) },
        remote: {
          ...current.remote,
          ...(payload.settings.remote || {}),
          telegramBotToken: current.remote.telegramBotToken, // preserve local secret
          discordWebhookUrl: current.remote.discordWebhookUrl,
        },
      };
      db.saveSettings(merged);
    }

    // 2. Queues import
    if (options.overwriteQueues !== false && Array.isArray(payload.queues)) {
      for (const q of payload.queues) {
        if (q && q.id && q.name) {
          db.saveQueue(q);
          importedQueues++;
        }
      }
    }

    // 3. Categories import
    if (options.overwriteCategories !== false && Array.isArray(payload.categories)) {
      for (const cat of payload.categories) {
        if (cat && cat.id && cat.name) {
          db.saveCategory(cat);
          importedCategories++;
        }
      }
    }

    return {
      success: true,
      importedQueues,
      importedCategories,
      message: `Successfully restored ${importedQueues} queue(s) and ${importedCategories} category rule(s).`,
    };
  }
}
