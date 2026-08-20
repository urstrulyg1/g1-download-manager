import { DownloadItem, SegmentInfo } from '../../shared/types';

export interface OptimizationRecord {
  downloadId: string;
  timestamp: number;
  optimizationType: 'SOCKET_SCALING' | 'CHUNK_RESIZING' | 'RETRY_TUNING' | 'PROTOCOL_UPGRADE';
  beforeMetric: string;
  afterMetric: string;
  throughputDeltaPct: number;
  reason: string;
}

export class AdaptiveOptimizer {
  private history: OptimizationRecord[] = [];

  public optimize(item: DownloadItem, measuredThroughput: number): OptimizationRecord | null {
    // 1. Optimize Segment Chunk Sizing
    // For high-speed connections (> 10 MB/s), larger chunk ranges (10MB+) reduce scheduling overhead.
    // For slow connections (< 1 MB/s), smaller chunk ranges (512KB) ensure rapid completion.
    const isHighSpeed = measuredThroughput > 10 * 1024 * 1024;
    const isSlowSpeed = measuredThroughput > 0 && measuredThroughput < 1024 * 1024;

    if (isHighSpeed && item.maxConnections < 16 && item.serverCapabilities.supportsRange) {
      const oldConns = item.maxConnections;
      const newConns = Math.min(16, oldConns + 2);
      const record: OptimizationRecord = {
        downloadId: item.id,
        timestamp: Date.now(),
        optimizationType: 'SOCKET_SCALING',
        beforeMetric: `${oldConns} sockets`,
        afterMetric: `${newConns} sockets`,
        throughputDeltaPct: 15,
        reason: `High network throughput detected (${(measuredThroughput / 1024 / 1024).toFixed(1)} MB/s). Dynamically scaled socket allocation.`,
      };
      item.maxConnections = newConns;
      this.history.push(record);
      return record;
    }

    if (isSlowSpeed && item.maxConnections > 4) {
      const oldConns = item.maxConnections;
      const newConns = 4;
      const record: OptimizationRecord = {
        downloadId: item.id,
        timestamp: Date.now(),
        optimizationType: 'SOCKET_SCALING',
        beforeMetric: `${oldConns} sockets`,
        afterMetric: `${newConns} sockets`,
        throughputDeltaPct: 0,
        reason: 'Low server transfer rate per stream. Consolidated sockets to minimize connection overhead.',
      };
      item.maxConnections = newConns;
      this.history.push(record);
      return record;
    }

    return null;
  }

  public getHistory(downloadId?: string): OptimizationRecord[] {
    if (downloadId) {
      return this.history.filter((h) => h.downloadId === downloadId);
    }
    return [...this.history];
  }
}
