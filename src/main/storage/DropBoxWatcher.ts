import * as fs from 'fs';
import * as path from 'path';
import { DownloadEngine } from '../engine/DownloadEngine';

export class DropBoxWatcher {
  private static watcher: fs.FSWatcher | null = null;

  public static startWatching(watchDir: string, engine: DownloadEngine): void {
    if (!fs.existsSync(watchDir)) {
      fs.mkdirSync(watchDir, { recursive: true });
    }

    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = fs.watch(watchDir, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const fullPath = path.join(watchDir, filename);
        if (fs.existsSync(fullPath)) {
          this.processDropFile(fullPath, engine);
        }
      }
    });
  }

  public static stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  public static async processDropFile(filePath: string, engine: DownloadEngine): Promise<number> {
    const ext = path.extname(filePath).toLowerCase();
    let count = 0;

    if (ext === '.urls' || ext === '.txt') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('http://') || l.startsWith('https://') || l.startsWith('magnet:'));

      for (const url of lines) {
        await engine.addDownload({ url, startImmediately: true });
        count++;
      }
    }

    return count;
  }
}
