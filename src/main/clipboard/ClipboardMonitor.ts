import { EventEmitter } from 'events';

export class ClipboardMonitor extends EventEmitter {
  private lastUrl: string = '';
  private isEnabled = true;

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public checkClipboardText(text: string): { isDownloadable: boolean; url?: string } {
    if (!this.isEnabled || !text || typeof text !== 'string') return { isDownloadable: false };

    // Max 2048 chars to prevent memory / regex DoS
    if (text.length > 2048) return { isDownloadable: false };

    // Strip leading/trailing whitespace, quotes, and angle brackets
    const trimmed = text.trim().replace(/^["'<]|["'>]$/g, '');
    if (!trimmed || trimmed === this.lastUrl) return { isDownloadable: false };

    const urlRegex = /^(https?|ftp|ftps):\/\/[^\s$.?#].[^\s]*$/i;
    if (urlRegex.test(trimmed)) {
      this.lastUrl = trimmed;
      this.emit('url_detected', trimmed);
      return { isDownloadable: true, url: trimmed };
    }

    return { isDownloadable: false };
  }
}
