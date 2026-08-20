import { DownloadItem } from '../../shared/types';

export interface MediaLibraryItem {
  downloadId: string;
  filename: string;
  filePath: string;
  category: 'video' | 'audio';
  resolutionLabel?: string;
  codec?: string;
  durationSec?: number;
  fileSizeBytes: number;
  downloadedAt: number;
  tags: string[];
}

export interface DownloadComparisonReport {
  itemA: { id: string; filename: string; avgSpeed: number; totalBytes: number; protocol: string; durationSec: number };
  itemB: { id: string; filename: string; avgSpeed: number; totalBytes: number; protocol: string; durationSec: number };
  speedDeltaRatio: number;
  fasterItem: string;
  bottleneckDifference: string;
}

export class MediaLibrary {
  private library: Map<string, MediaLibraryItem> = new Map();

  public indexDownload(item: DownloadItem, tags: string[] = []): MediaLibraryItem | null {
    if (item.status !== 'completed') return null;
    if (item.category !== 'video' && item.category !== 'audio') return null;

    const mediaItem: MediaLibraryItem = {
      downloadId: item.id,
      filename: item.filename,
      filePath: item.finalPath,
      category: item.category as any,
      resolutionLabel: item.filename.includes('2160p') ? '2160p' : item.filename.includes('1080p') ? '1080p' : item.filename.includes('720p') ? '720p' : 'Auto',
      codec: 'H.264',
      fileSizeBytes: item.downloadedBytes || item.totalBytes,
      downloadedAt: item.completedAt || Date.now(),
      tags,
    };

    this.library.set(item.id, mediaItem);
    return mediaItem;
  }

  public getLibrary(): MediaLibraryItem[] {
    return Array.from(this.library.values()).sort((a, b) => b.downloadedAt - a.downloadedAt);
  }

  public compareDownloads(itemA: DownloadItem, itemB: DownloadItem): DownloadComparisonReport {
    const speedA = itemA.avgSpeed || itemA.speed || 1;
    const speedB = itemB.avgSpeed || itemB.speed || 1;

    const ratio = Math.round((Math.max(speedA, speedB) / Math.min(speedA, speedB)) * 10) / 10;
    const faster = speedA >= speedB ? itemA.filename : itemB.filename;

    let difference = 'Both transfers achieved comparable server and network throughput.';
    if (ratio > 1.5) {
      difference = `${faster} was ${ratio}x faster due to higher server bandwidth allocation and range multi-threading.`;
    }

    return {
      itemA: {
        id: itemA.id,
        filename: itemA.filename,
        avgSpeed: speedA,
        totalBytes: itemA.totalBytes,
        protocol: itemA.serverCapabilities.protocol,
        durationSec: Math.round((itemA.durationMs || 1000) / 1000),
      },
      itemB: {
        id: itemB.id,
        filename: itemB.filename,
        avgSpeed: speedB,
        totalBytes: itemB.totalBytes,
        protocol: itemB.serverCapabilities.protocol,
        durationSec: Math.round((itemB.durationMs || 1000) / 1000),
      },
      speedDeltaRatio: ratio,
      fasterItem: faster,
      bottleneckDifference: difference,
    };
  }
}
