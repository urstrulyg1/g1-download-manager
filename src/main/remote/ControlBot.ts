import { DownloadEngine } from '../engine/DownloadEngine';

export interface ControlBotConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  enabled: boolean;
}

export class ControlBot {
  private static config: ControlBotConfig = { enabled: false };

  public static configure(cfg: ControlBotConfig) {
    this.config = cfg;
  }

  public static async processCommand(
    commandText: string,
    engine: DownloadEngine
  ): Promise<{ responseText: string; actionTaken?: string }> {
    const parts = commandText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (cmd === '/add' || cmd === 'add') {
      if (!arg) return { responseText: '⚠️ Usage: /add <url>' };
      const item = await engine.addDownload({ url: arg, startImmediately: true });
      return { responseText: `✅ Enqueued download: ${item.filename} (ID: ${item.id})`, actionTaken: 'add' };
    }

    if (cmd === '/list' || cmd === 'list' || cmd === '/status' || cmd === 'status') {
      const items = engine.getAllDownloads();
      if (items.length === 0) return { responseText: 'ℹ️ Download queue is currently empty.' };
      const listStr = items
        .slice(0, 5)
        .map((d) => `• [${d.status.toUpperCase()}] ${d.filename} (${(d.progress * 100).toFixed(1)}%)`)
        .join('\n');
      return { responseText: `📊 Active Queue:\n${listStr}`, actionTaken: 'list' };
    }

    if (cmd === '/pause' || cmd === 'pause') {
      engine.pauseAll();
      return { responseText: '⏸ All active downloads paused.', actionTaken: 'pause' };
    }

    if (cmd === '/resume' || cmd === 'resume') {
      engine.resumeAll();
      return { responseText: '▶️ All paused downloads resumed.', actionTaken: 'resume' };
    }

    return { responseText: '❓ Available commands: /add <url>, /status, /pause, /resume' };
  }

  public static async sendNotification(message: string): Promise<boolean> {
    if (!this.config.enabled) return false;

    if (this.config.discordWebhookUrl) {
      try {
        await fetch(this.config.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `🤖 G1DM Bot: ${message}` }),
        });
      } catch {
        // Notification error
      }
    }

    return true;
  }
}
