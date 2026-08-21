import { AppSettings } from '../../shared/types';

const REDACTED = '***REDACTED***';

/**
 * Returns a deep-cloned copy of the app settings with all secrets removed, so
 * the result is safe to include in exports, backups, and diagnostics reports.
 */
export function redactSettings(settings: AppSettings): AppSettings {
  const clean = JSON.parse(JSON.stringify(settings)) as AppSettings;

  if (clean.network) {
    if (clean.network.proxyPassword) clean.network.proxyPassword = REDACTED;
    if (clean.network.proxyUsername) clean.network.proxyUsername = REDACTED;
  }
  if (clean.security) {
    if (clean.security.virusTotalApiKey) clean.security.virusTotalApiKey = REDACTED;
    if (clean.security.apiKey) clean.security.apiKey = REDACTED;
  }
  if (clean.automation && Array.isArray(clean.automation.archivePasswords)) {
    clean.automation.archivePasswords = clean.automation.archivePasswords.map(() => REDACTED);
  }
  if (clean.remote) {
    if (clean.remote.telegramBotToken) clean.remote.telegramBotToken = REDACTED;
    if (clean.remote.discordWebhookUrl) clean.remote.discordWebhookUrl = REDACTED;
  }

  return clean;
}
