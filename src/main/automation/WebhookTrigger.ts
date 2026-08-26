import { execFile } from 'child_process';
import { DownloadItem } from '../../shared/types';

export interface WebhookConfig {
  enabled: boolean;
  webhookUrl?: string; // Discord, Slack, IFTTT or custom URL
  customScriptPath?: string;
  triggerOnComplete: boolean;
  triggerOnError: boolean;
}

/** Timeout for outbound webhook HTTP POST requests (10 s). */
const WEBHOOK_TIMEOUT_MS = 10_000;

export class WebhookTrigger {
  public static async executeTriggers(item: DownloadItem, config: WebhookConfig): Promise<{ webhookSent: boolean; scriptExecuted: boolean }> {
    let webhookSent = false;
    let scriptExecuted = false;

    if (!config.enabled) return { webhookSent: false, scriptExecuted: false };

    // 1. Send Webhook HTTP POST
    if (config.webhookUrl) {
      // Basic sanity check — only allow http/https destinations
      let parsedWebhookUrl: URL | null = null;
      try {
        parsedWebhookUrl = new URL(config.webhookUrl);
      } catch {
        // malformed URL — skip
      }

      if (parsedWebhookUrl && (parsedWebhookUrl.protocol === 'http:' || parsedWebhookUrl.protocol === 'https:')) {
        try {
          const payload = {
            event: item.status === 'completed' ? 'download_completed' : 'download_failed',
            download: {
              id: item.id,
              filename: item.filename,
              url: item.url,
              finalPath: item.finalPath,
              totalBytes: item.totalBytes,
              downloadedBytes: item.downloadedBytes,
              durationMs: item.durationMs,
            },
            timestamp: Date.now(),
          };

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
          try {
            const res = await fetch(config.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            webhookSent = res.ok;
          } finally {
            clearTimeout(timeoutId);
          }
        } catch {
          webhookSent = false;
        }
      }
    }

    // 2. Execute Custom Post-Download Script (execFile → no shell interpolation,
    //    so malicious filenames cannot inject commands)
    if (config.customScriptPath) {
      try {
        const env = {
          ...process.env,
          G1DM_FILE_PATH: item.finalPath,
          G1DM_FILENAME: item.filename,
          G1DM_URL: item.url,
          G1DM_STATUS: item.status,
          G1DM_TOTAL_BYTES: String(item.totalBytes || 0),
        };
        execFile(config.customScriptPath, [item.finalPath], { env, timeout: 120000 }, (err) => {
          if (err) console.warn('Script execution failed:', err.message);
        });
        scriptExecuted = true;
      } catch {
        scriptExecuted = false;
      }
    }

    return { webhookSent, scriptExecuted };
  }
}
