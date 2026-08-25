import { EventEmitter } from 'events';
import { DownloadItem, Priority } from '../../shared/types';

export interface BandwidthAllocation {
  downloadId: string;
  allocatedBytesPerSec: number;
  priority: Priority;
  weight: number;
  minFloorBytesPerSec: number;
}

export class BandwidthGovernor extends EventEmitter {
  private static readonly PRIORITY_WEIGHTS: Record<Priority, number> = {
    urgent: 4.0,
    high: 3.0,
    normal: 2.0,
    low: 1.0,
  };

  // Minimum bandwidth floor to prevent starvation (e.g., 64 KB/s per active download)
  private minStarvationFloorBytes = 64 * 1024;
  private globalLimitBytesPerSec = 0; // 0 = unlimited

  constructor(globalLimitBytesPerSec: number = 0) {
    super();
    this.globalLimitBytesPerSec = globalLimitBytesPerSec;
  }

  public setGlobalLimit(bytesPerSec: number): void {
    this.globalLimitBytesPerSec = Math.max(0, bytesPerSec);
    this.emit('limit_changed', this.globalLimitBytesPerSec);
  }

  public getGlobalLimit(): number {
    return this.globalLimitBytesPerSec;
  }

  /**
   * Calculates fair-share, weighted bandwidth allocation for all active downloads
   * without starving low-priority downloads.
   */
  public calculateAllocations(activeDownloads: DownloadItem[]): Map<string, BandwidthAllocation> {
    const allocations = new Map<string, BandwidthAllocation>();
    if (activeDownloads.length === 0) return allocations;

    // Filter to those currently in downloading state
    const downloadingItems = activeDownloads.filter((d) => d.status === 'downloading');
    if (downloadingItems.length === 0) return allocations;

    // If global limit is 0 (unlimited), allocate per-item speedLimit or unlimited (0)
    if (this.globalLimitBytesPerSec <= 0) {
      for (const item of downloadingItems) {
        const weight = BandwidthGovernor.PRIORITY_WEIGHTS[item.priority] || 2.0;
        allocations.set(item.id, {
          downloadId: item.id,
          allocatedBytesPerSec: item.speedLimitBytesPerSec || 0,
          priority: item.priority,
          weight,
          minFloorBytesPerSec: this.minStarvationFloorBytes,
        });
      }
      return allocations;
    }

    const n = downloadingItems.length;
    const totalGlobal = this.globalLimitBytesPerSec;

    // If total limit is too small to even give each item the starvation floor, split equally
    if (totalGlobal < n * this.minStarvationFloorBytes) {
      const perItem = Math.floor(totalGlobal / n);
      for (const item of downloadingItems) {
        const weight = BandwidthGovernor.PRIORITY_WEIGHTS[item.priority] || 2.0;
        allocations.set(item.id, {
          downloadId: item.id,
          allocatedBytesPerSec: perItem,
          priority: item.priority,
          weight,
          minFloorBytesPerSec: perItem,
        });
      }
      return allocations;
    }

    // Step 1: Assign starvation floor to all active items
    const guaranteedBase = this.minStarvationFloorBytes;
    const remainingPool = totalGlobal - n * guaranteedBase;

    // Step 2: Calculate total priority weight sum
    let totalWeight = 0;
    for (const item of downloadingItems) {
      const w = BandwidthGovernor.PRIORITY_WEIGHTS[item.priority] || 2.0;
      totalWeight += w;
    }

    // Step 3: Distribute remaining pool according to normalized priority weight
    for (const item of downloadingItems) {
      const weight = BandwidthGovernor.PRIORITY_WEIGHTS[item.priority] || 2.0;
      const weightedShare = totalWeight > 0 ? (weight / totalWeight) * remainingPool : remainingPool / n;
      let targetBandwidth = Math.floor(guaranteedBase + weightedShare);

      // If user set a specific per-download speed limit lower than the calculated share, respect it
      if (item.speedLimitBytesPerSec > 0 && targetBandwidth > item.speedLimitBytesPerSec) {
        targetBandwidth = item.speedLimitBytesPerSec;
      }

      allocations.set(item.id, {
        downloadId: item.id,
        allocatedBytesPerSec: targetBandwidth,
        priority: item.priority,
        weight,
        minFloorBytesPerSec: guaranteedBase,
      });
    }

    return allocations;
  }
}
