import { EventEmitter } from 'events';
import { ProbeService } from './ProbeService';
import { DownloadEngine } from './DownloadEngine';

export interface SyncTargetResource {
  url: string;
  localPath: string;
  lastKnownEtag?: string;
  lastKnownModified?: string;
  lastKnownSize?: number;
  lastSyncedAt?: number;
  status: 'IN_SYNC' | 'CHANGED_REMOTE' | 'NEW' | 'ERROR';
}

export interface SyncReport {
  projectId: string;
  timestamp: number;
  totalChecked: number;
  updatedCount: number;
  inSyncCount: number;
  details: { url: string; action: string }[];
}

export class SyncQueueManager extends EventEmitter {
  private engine: DownloadEngine;

  constructor(engine: DownloadEngine) {
    super();
    this.engine = engine;
  }

  public async synchronizeResources(
    projectId: string,
    resources: SyncTargetResource[]
  ): Promise<SyncReport> {
    const report: SyncReport = {
      projectId,
      timestamp: Date.now(),
      totalChecked: resources.length,
      updatedCount: 0,
      inSyncCount: 0,
      details: [],
    };

    for (const res of resources) {
      try {
        const probe = await ProbeService.probe(res.url);
        const remoteEtag = probe.capabilities.etag;
        const remoteModified = probe.capabilities.lastModified;
        const remoteSize = probe.size;

        const isModified =
          (res.lastKnownEtag && remoteEtag && res.lastKnownEtag !== remoteEtag) ||
          (res.lastKnownModified && remoteModified && res.lastKnownModified !== remoteModified) ||
          (res.lastKnownSize && remoteSize > 0 && res.lastKnownSize !== remoteSize);

        if (isModified || !res.lastKnownEtag) {
          res.status = 'CHANGED_REMOTE';
          res.lastKnownEtag = remoteEtag;
          res.lastKnownModified = remoteModified;
          res.lastKnownSize = remoteSize;
          res.lastSyncedAt = Date.now();

          await this.engine.addDownload({
            url: res.url,
            destinationDir: res.localPath,
            startImmediately: true,
          });

          report.updatedCount++;
          report.details.push({ url: res.url, action: 'Enqueued updated file for download' });
        } else {
          res.status = 'IN_SYNC';
          report.inSyncCount++;
          report.details.push({ url: res.url, action: 'Resource in sync with remote' });
        }
      } catch (err: any) {
        res.status = 'ERROR';
        report.details.push({ url: res.url, action: `Probe failed: ${err.message}` });
      }
    }

    this.emit('sync_completed', report);
    return report;
  }
}
