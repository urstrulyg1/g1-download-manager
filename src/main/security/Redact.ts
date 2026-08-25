import { AppSettings } from '../../shared/types';

const REDACTED = '***REDACTED***';

/**
 * Returns a deep-cloned copy of the app settings with all secrets removed, so
 * the result is safe to include in exports, backups, and diagnostics reports.
 */
export function redactSettings(settings: AppSettings): AppSettings {
  if (!settings) return settings;
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

/**
 * Redacts embedded credentials from URLs, e.g. http://user:pass@host/file -> http://user:***REDACTED***@host/file
 */
export function redactUrlCredentials(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = REDACTED;
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    // Regex fallback for non-standard or partial URLs
    return rawUrl.replace(/(https?:\/\/|ftp:\/\/|ftps:\/\/)([^:]+):([^@]+)@/i, `$1$2:${REDACTED}@`);
  }
}

/**
 * Sanitizes headers object, redacting Authorization, Cookies, X-Api-Key, etc.
 */
export function redactHeaders(headers: Record<string, any>): Record<string, any> {
  if (!headers || typeof headers !== 'object') return headers;
  const clean: Record<string, any> = { ...headers };
  for (const key of Object.keys(clean)) {
    const lower = key.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'cookie' ||
      lower === 'set-cookie' ||
      lower === 'x-api-key' ||
      lower === 'proxy-authorization' ||
      lower === 'x-g1dm-key' ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password')
    ) {
      clean[key] = REDACTED;
    }
  }
  return clean;
}
