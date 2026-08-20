import * as fs from 'fs';
import * as path from 'path';
import { DownloadItem, SegmentInfo, ServerCapabilities } from '../../shared/types';
import { SecretStore } from '../security/SecretStore';

export interface DownloadSnapshot {
  version: '1.0.0';
  snapshotId: string;
  downloadId: string;
  url: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  category: string;
  queueId: string;
  priority: string;
  serverCapabilities: ServerCapabilities;
  segments: SegmentInfo[];
  createdAt: number;
  snapshotTimestamp: number;
}

export class SnapshotManager {
  public static createSnapshot(item: DownloadItem): DownloadSnapshot {
    // Redact secret credentials from URL if any query param has tokens
    const cleanUrl = SecretStore.redactString(item.url);

    return {
      version: '1.0.0',
      snapshotId: `snap_${item.id}_${Date.now()}`,
      downloadId: item.id,
      url: cleanUrl,
      filename: item.filename,
      totalBytes: item.totalBytes,
      downloadedBytes: item.downloadedBytes,
      category: item.category,
      queueId: item.queueId,
      priority: item.priority,
      serverCapabilities: item.serverCapabilities,
      segments: item.segments ? JSON.parse(JSON.stringify(item.segments)) : [],
      createdAt: item.createdAt,
      snapshotTimestamp: Date.now(),
    };
  }

  public static exportSnapshotToFile(item: DownloadItem, targetPath: string): string {
    const snapshot = this.createSnapshot(item);
    fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2), 'utf8');
    return targetPath;
  }

  public static validateAndLoadSnapshot(snapshotJson: string): { valid: boolean; snapshot?: DownloadSnapshot; error?: string } {
    try {
      const parsed: DownloadSnapshot = JSON.parse(snapshotJson);
      if (!parsed.downloadId || !parsed.url || !parsed.filename) {
        return { valid: false, error: 'Invalid snapshot format: Missing downloadId, url, or filename.' };
      }
      return { valid: true, snapshot: parsed };
    } catch (err: any) {
      return { valid: false, error: `JSON parse error: ${err.message}` };
    }
  }
}
