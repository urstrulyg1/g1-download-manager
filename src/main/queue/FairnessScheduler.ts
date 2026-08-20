import { DownloadItem, DownloadQueue, Priority } from '../../shared/types';

export interface QueueAllocation {
  queueId: string;
  weight: number;
  allocatedBandwidthBytesPerSec: number;
  allocatedConnections: number;
  activeDownloadsCount: number;
}

export class FairnessScheduler {
  private static readonly PRIORITY_WEIGHTS: Record<Priority, number> = {
    urgent: 8,
    high: 4,
    normal: 2,
    low: 1,
  };

  public static calculateAllocations(
    queues: DownloadQueue[],
    downloads: DownloadItem[],
    globalBandwidthLimit = 0,
    globalMaxConnections = 24
  ): Map<string, QueueAllocation> {
    const allocations = new Map<string, QueueAllocation>();
    const activeDownloads = downloads.filter((d) => d.status === 'downloading');

    let totalWeight = 0;

    for (const q of queues) {
      const qDownloads = activeDownloads.filter((d) => d.queueId === q.id);
      if (qDownloads.length === 0) continue;

      let qWeight = 0;
      for (const d of qDownloads) {
        qWeight += this.PRIORITY_WEIGHTS[d.priority] || 2;
      }

      totalWeight += qWeight;
      allocations.set(q.id, {
        queueId: q.id,
        weight: qWeight,
        allocatedBandwidthBytesPerSec: 0,
        allocatedConnections: 0,
        activeDownloadsCount: qDownloads.length,
      });
    }

    if (totalWeight === 0) return allocations;

    for (const [qId, alloc] of allocations.entries()) {
      const ratio = alloc.weight / totalWeight;

      alloc.allocatedConnections = Math.max(
        1,
        Math.floor(globalMaxConnections * ratio)
      );

      if (globalBandwidthLimit > 0) {
        alloc.allocatedBandwidthBytesPerSec = Math.floor(globalBandwidthLimit * ratio);
      } else {
        alloc.allocatedBandwidthBytesPerSec = 0; // Unlimited
      }
    }

    return allocations;
  }
}
