import { EventEmitter } from 'events';

export class ClipboardMonitor extends EventEmitter {
  private lastUrl: string = '';
  private isEnabled = true;

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public checkClipboardText(text: string): { isDownloadable: boolean; url?: string } {
    if (!this.isEnabled || !text) return { isDownloadable: false };

    const trimmed = text.trim();
    if (trimmed === this.lastUrl) return { isDownloadable: false };

    const urlRegex = /^(https?|ftp|ftps):\/\/[^\s$.?#].[^\s]*$/i;
    if (urlRegex.test(trimmed)) {
      this.lastUrl = trimmed;
      this.emit('url_detected', trimmed);
      return { isDownloadable: true, url: trimmed };
    }

    return { isDownloadable: false };
  }
}
