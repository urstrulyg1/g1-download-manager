import { exec } from 'child_process';
import { DownloadItem } from '../../shared/types';

export interface WebhookConfig {
  enabled: boolean;
  webhookUrl?: string; // Discord, Slack, IFTTT or custom URL
  customScriptPath?: string;
  triggerOnComplete: boolean;
  triggerOnError: boolean;
}

export class WebhookTrigger {
  public static async executeTriggers(item: DownloadItem, config: WebhookConfig): Promise<{ webhookSent: boolean; scriptExecuted: boolean }> {
    let webhookSent = false;
    let scriptExecuted = false;

    if (!config.enabled) return { webhookSent: false, scriptExecuted: false };

    // 1. Send Webhook HTTP POST
    if (config.webhookUrl) {
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

        const res = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        webhookSent = res.ok;
      } catch {
        webhookSent = false;
      }
    }

    // 2. Execute Custom Post-Download Script
    if (config.customScriptPath) {
      try {
        const env = {
          ...process.env,
          G1DM_FILE_PATH: item.finalPath,
          G1DM_FILENAME: item.filename,
          G1DM_URL: item.url,
        };
        exec(`"${config.customScriptPath}" "${item.finalPath}"`, { env }, (err) => {
          if (err) console.warn('Script execution failed:', err);
        });
        scriptExecuted = true;
      } catch {
        scriptExecuted = false;
      }
    }

    return { webhookSent, scriptExecuted };
  }
}
