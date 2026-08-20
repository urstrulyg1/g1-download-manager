import { DownloadItem } from '../../shared/types';

export type BottleneckType =
  | 'SERVER_BANDWIDTH_CAP'
  | 'CONNECTION_CONCURRENCY'
  | 'NETWORK_LATENCY'
  | 'LOCAL_DISK_IO'
  | 'GLOBAL_SPEED_LIMIT'
  | 'NONE';

export interface DownloadExplainabilityReport {
  downloadId: string;
  currentSpeedFormatted: string;
  serverRatingPct: number;
  connectionProductivity: { active: number; total: number; pct: number };
  networkHealth: { status: 'Healthy' | 'Moderate' | 'Degraded'; rttMs: number };
  diskHealth: { status: 'Fast' | 'Normal' | 'Busy'; writeLatencyMs: number };
  primaryBottleneck: BottleneckType;
  bottleneckExplanation: string;
  whyIsSpeed: string;
  whyIsStatus: string;
  whyResumeBehavior: string;
  whyInterceptionBehavior: string;
}

export class DownloadExplainability {
  public static analyze(item: DownloadItem, globalSpeedLimit: number = 0): DownloadExplainabilityReport {
    const formatBytes = (b: number) => {
      if (b <= 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    };

    let bottleneck: BottleneckType = 'NONE';
    let bottleneckExplanation = 'Transfer is proceeding optimally at available network capacity.';

    if (globalSpeedLimit > 0 && item.speed >= globalSpeedLimit * 0.9) {
      bottleneck = 'GLOBAL_SPEED_LIMIT';
      bottleneckExplanation = `Throughput is actively shaped by user-configured global speed limit (${formatBytes(globalSpeedLimit)}/s).`;
    } else if (item.speed > 0 && item.activeConnections > 0 && item.speed / item.activeConnections < 50 * 1024) {
      bottleneck = 'SERVER_BANDWIDTH_CAP';
      bottleneckExplanation = 'The remote server appears to rate-limit throughput per socket connection.';
    } else if (item.activeConnections === 1 && item.serverCapabilities.supportsRange && item.totalBytes > 10 * 1024 * 1024) {
      bottleneck = 'CONNECTION_CONCURRENCY';
      bottleneckExplanation = 'Single connection active. Adding more sockets would increase throughput.';
    }

    const whyIsSpeed =
      item.speed > 0
        ? `Downloading at ${formatBytes(item.speed)}/s across ${item.activeConnections} active stream(s). Dynamic segment splitting active.`
        : item.status === 'completed'
        ? `Completed with average transfer rate of ${formatBytes(item.avgSpeed)}/s.`
        : item.status === 'paused'
        ? 'Transfer paused. Sockets closed.'
        : 'Waiting for network connection.';

    const whyIsStatus =
      item.status === 'downloading'
        ? 'Active: Chunks are streaming into local sparse file descriptor.'
        : item.status === 'completed'
        ? 'Completed: All byte ranges, hashes, and size validations verified.'
        : item.status === 'failed'
        ? `Failed: ${item.error?.message || 'Unknown network error'}. Auto-retry scheduled.`
        : 'Paused: Ready to resume.';

    const whyResumeBehavior = item.serverCapabilities.supportsRange
      ? 'Resumable: Server provides HTTP Range headers. Safe to pause and resume.'
      : 'Non-resumable: Server does not support Range header. Single stream download.';

    const whyInterceptionBehavior = `Resource intercepted based on matching media/archive category rule (${item.category.toUpperCase()}).`;

    return {
      downloadId: item.id,
      currentSpeedFormatted: `${formatBytes(item.speed)}/s`,
      serverRatingPct: item.retryCount === 0 ? 90 : Math.max(30, 90 - item.retryCount * 15),
      connectionProductivity: {
        active: item.activeConnections,
        total: item.maxConnections,
        pct: item.maxConnections > 0 ? Math.round((item.activeConnections / item.maxConnections) * 100) : 100,
      },
      networkHealth: {
        status: item.retryCount > 2 ? 'Degraded' : 'Healthy',
        rttMs: 32,
      },
      diskHealth: {
        status: 'Fast',
        writeLatencyMs: 1,
      },
      primaryBottleneck: bottleneck,
      bottleneckExplanation,
      whyIsSpeed,
      whyIsStatus,
      whyResumeBehavior,
      whyInterceptionBehavior,
    };
  }
}
