import { DownloadEngine } from '../engine/DownloadEngine';

export interface ControlBotConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramAllowedChatIds?: string[];
  discordWebhookUrl?: string;
  enabled: boolean;
}

export interface ControlBotStatus {
  enabled: boolean;
  telegramPolling: boolean;
  telegramBotUsername?: string;
  lastUpdateAt?: number;
  commandsProcessed: number;
  lastError?: string;
}

/**
 * Remote control bot.
 *
 * - processCommand(): shared command parser used by the REST endpoint,
 *   the Telegram polling loop, and any future frontends.
 * - startTelegramPolling(): real long-polling loop against the Telegram
 *   Bot API (getUpdates) so links sent from a phone are downloaded on
 *   the desktop, with progress replies. Chat-ID allowlisting prevents
 *   strangers from controlling your download manager.
 */
export class ControlBot {
  private static config: ControlBotConfig = { enabled: false };
  private static polling = false;
  private static pollAbort: AbortController | null = null;
  private static telegramOffset = 0;
  private static botUsername: string | undefined;
  private static commandsProcessed = 0;
  private static lastUpdateAt: number | undefined;
  private static lastError: string | undefined;
  private static engineRef: DownloadEngine | null = null;

  public static configure(cfg: ControlBotConfig, engine?: DownloadEngine) {
    this.config = cfg;
    if (engine) this.engineRef = engine;

    if (cfg.enabled && cfg.telegramBotToken && this.engineRef) {
      this.startTelegramPolling(this.engineRef);
    } else {
      this.stopTelegramPolling();
    }
  }

  public static getStatus(): ControlBotStatus {
    return {
      enabled: this.config.enabled,
      telegramPolling: this.polling,
      telegramBotUsername: this.botUsername,
      lastUpdateAt: this.lastUpdateAt,
      commandsProcessed: this.commandsProcessed,
      lastError: this.lastError,
    };
  }

  // ------------------------------------------------------------ command parser

  public static async processCommand(
    commandText: string,
    engine: DownloadEngine
  ): Promise<{ responseText: string; actionTaken?: string }> {
    const parts = commandText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase().replace(/@\S+$/, ''); // strip @BotName suffix
    const arg = parts.slice(1).join(' ');

    // A bare URL pasted with no command counts as /add
    if (/^https?:\/\//i.test(cmd) || cmd.startsWith('magnet:')) {
      const item = await engine.addDownload({ url: commandText.trim(), startImmediately: true });
      this.commandsProcessed++;
      return { responseText: `✅ Enqueued download: ${item.filename} (ID: ${item.id})`, actionTaken: 'add' };
    }

    if (cmd === '/add' || cmd === 'add') {
      if (!arg) return { responseText: '⚠️ Usage: /add <url>' };
      const item = await engine.addDownload({ url: arg, startImmediately: true });
      this.commandsProcessed++;
      return { responseText: `✅ Enqueued download: ${item.filename} (ID: ${item.id})`, actionTaken: 'add' };
    }

    if (cmd === '/list' || cmd === 'list' || cmd === '/status' || cmd === 'status') {
      const items = engine.getAllDownloads();
      if (items.length === 0) return { responseText: 'ℹ️ Download queue is currently empty.' };
      const active = items.filter((d) => d.status === 'downloading' || d.status === 'queued');
      const shown = (active.length > 0 ? active : items).slice(0, 8);
      const listStr = shown
        .map((d) => `• [${d.status.toUpperCase()}] ${d.filename} (${(d.progress * 100).toFixed(1)}%)`)
        .join('\n');
      this.commandsProcessed++;
      return { responseText: `📊 Queue (${items.length} total):\n${listStr}`, actionTaken: 'list' };
    }

    if (cmd === '/pause' || cmd === 'pause') {
      engine.pauseAll();
      this.commandsProcessed++;
      return { responseText: '⏸ All active downloads paused.', actionTaken: 'pause' };
    }

    if (cmd === '/resume' || cmd === 'resume') {
      engine.resumeAll();
      this.commandsProcessed++;
      return { responseText: '▶️ All paused downloads resumed.', actionTaken: 'resume' };
    }

    if (cmd === '/speed' || cmd === 'speed') {
      const items = engine.getAllDownloads().filter((d) => d.status === 'downloading');
      const total = items.reduce((sum, d) => sum + (d.speed || 0), 0);
      this.commandsProcessed++;
      return {
        responseText: `🚀 ${items.length} active transfer(s) at ${(total / (1024 * 1024)).toFixed(2)} MB/s combined.`,
        actionTaken: 'speed',
      };
    }

    if (cmd === '/help' || cmd === 'help' || cmd === '/start') {
      return {
        responseText:
          '🤖 G1DM Remote Control\n\n' +
          '/add <url> — enqueue a download (or just paste a link)\n' +
          '/status — show queue status\n' +
          '/speed — current combined transfer speed\n' +
          '/pause — pause all downloads\n' +
          '/resume — resume all downloads',
      };
    }

    return { responseText: '❓ Unknown command. Send /help for the command list.' };
  }

  // ------------------------------------------------------------ Telegram long polling

  public static async startTelegramPolling(engine: DownloadEngine): Promise<boolean> {
    const token = this.config.telegramBotToken;
    if (!token || this.polling) return this.polling;

    this.engineRef = engine;
    this.polling = true;
    this.pollAbort = new AbortController();
    this.lastError = undefined;

    // Validate the token and learn the bot username (non-fatal on failure).
    try {
      const me = await this.telegramApi(token, 'getMe', {});
      if (me?.ok) this.botUsername = me.result?.username;
    } catch (err: any) {
      this.lastError = `getMe failed: ${err.message}`;
    }

    void this.pollLoop(token, engine);
    return true;
  }

  public static stopTelegramPolling(): void {
    this.polling = false;
    if (this.pollAbort) {
      this.pollAbort.abort();
      this.pollAbort = null;
    }
  }

  private static async pollLoop(token: string, engine: DownloadEngine): Promise<void> {
    while (this.polling && this.config.enabled) {
      try {
        const updates = await this.telegramApi(
          token,
          'getUpdates',
          { offset: this.telegramOffset, timeout: 25, allowed_updates: ['message'] },
          30000
        );

        if (updates?.ok && Array.isArray(updates.result)) {
          for (const update of updates.result) {
            this.telegramOffset = Math.max(this.telegramOffset, (update.update_id || 0) + 1);
            const msg = update.message;
            if (!msg || !msg.text) continue;

            this.lastUpdateAt = Date.now();
            const chatId = String(msg.chat?.id ?? '');

            if (!this.isChatAllowed(chatId)) {
              await this.telegramApi(token, 'sendMessage', {
                chat_id: chatId,
                text: '🚫 This chat is not authorized to control G1DM. Add your chat ID to the allowlist in Settings → Remote.',
              });
              continue;
            }

            try {
              const result = await this.processCommand(msg.text, engine);
              await this.telegramApi(token, 'sendMessage', { chat_id: chatId, text: result.responseText });
            } catch (cmdErr: any) {
              await this.telegramApi(token, 'sendMessage', { chat_id: chatId, text: `❌ Error: ${cmdErr.message}` });
            }
          }
        }
      } catch (err: any) {
        if (!this.polling) break;
        this.lastError = err.message;
        // Back off on errors (bad token, network down) so we don't spin.
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
    this.polling = false;
  }

  private static isChatAllowed(chatId: string): boolean {
    const allow = (this.config.telegramAllowedChatIds || []).map((c) => String(c).trim()).filter(Boolean);
    if (this.config.telegramChatId) allow.push(String(this.config.telegramChatId).trim());
    // If no allowlist is configured, accept all chats (user opted in by enabling the bot).
    if (allow.length === 0) return true;
    return allow.includes(chatId);
  }

  private static async telegramApi(token: string, method: string, body: any, timeoutMs = 15000): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------ notifications

  public static async sendNotification(message: string): Promise<boolean> {
    if (!this.config.enabled) return false;
    let sent = false;

    if (this.config.discordWebhookUrl) {
      try {
        const res = await fetch(this.config.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `🤖 G1DM Bot: ${message}` }),
        });
        sent = sent || res.ok;
      } catch {
        // Notification error — non-fatal
      }
    }

    if (this.config.telegramBotToken) {
      const targets = new Set<string>(
        [...(this.config.telegramAllowedChatIds || []), this.config.telegramChatId || ''].map((c) => String(c).trim()).filter(Boolean)
      );
      for (const chatId of targets) {
        try {
          await this.telegramApi(this.config.telegramBotToken, 'sendMessage', {
            chat_id: chatId,
            text: `🤖 G1DM: ${message}`,
          });
          sent = true;
        } catch {
          // ignore
        }
      }
    }

    return sent;
  }
}
