export interface ConcurrencyRecommendation {
  optimalWorkers: number;
  minWorkers: number;
  maxWorkers: number;
  initialChunkSizeBytes: number;
  reason: string;
}

export class WorkScheduler {
  public static calculateOptimalWorkers(params: {
    totalBytes: number;
    rangeSupport: boolean;
    protocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3' | 'FTP' | 'HLS' | 'DASH';
    rttMs?: number;
    userMaxConnections?: number;
    serverThrottled?: boolean;
    isMobileMetered?: boolean;
  }): ConcurrencyRecommendation {
    const userMax = params.userMaxConnections || 8;
    const rtt = params.rttMs || 40;

    if (!params.rangeSupport || params.totalBytes <= 0) {
      return {
        optimalWorkers: 1,
        minWorkers: 1,
        maxWorkers: 1,
        initialChunkSizeBytes: 0,
        reason: 'Single stream mode: Server lacks Range request support or Content-Length is streaming.',
      };
    }

    if (params.serverThrottled) {
      return {
        optimalWorkers: 2,
        minWorkers: 1,
        maxWorkers: 4,
        initialChunkSizeBytes: 512 * 1024,
        reason: 'Conservative concurrency: Server recently returned HTTP 429 rate limiting.',
      };
    }

    if (params.isMobileMetered) {
      return {
        optimalWorkers: 2,
        minWorkers: 1,
        maxWorkers: 2,
        initialChunkSizeBytes: 1024 * 1024,
        reason: 'Metered network profile: Minimal socket count.',
      };
    }

    const mb = params.totalBytes / (1024 * 1024);

    if (mb < 2) {
      return {
        optimalWorkers: 1,
        minWorkers: 1,
        maxWorkers: 2,
        initialChunkSizeBytes: params.totalBytes,
        reason: 'Small file (< 2 MB): Parallel scheduling overhead exceeds single-socket throughput.',
      };
    }

    if (mb < 15) {
      return {
        optimalWorkers: Math.min(userMax, 4),
        minWorkers: 2,
        maxWorkers: 4,
        initialChunkSizeBytes: 2 * 1024 * 1024,
        reason: 'Medium file (2-15 MB): 4 parallel streams optimal.',
      };
    }

    if (mb < 100) {
      const optimal = params.protocol === 'HTTP/2' || params.protocol === 'HTTP/3' ? Math.min(userMax, 8) : Math.min(userMax, 6);
      return {
        optimalWorkers: optimal,
        minWorkers: 4,
        maxWorkers: 12,
        initialChunkSizeBytes: 8 * 1024 * 1024,
        reason: `Large file (${mb.toFixed(0)} MB): Multiplexed range partitioning active.`,
      };
    }

    // Very large multi-GB files
    const optimal = params.protocol === 'HTTP/2' || params.protocol === 'HTTP/3' ? Math.min(userMax, 12) : Math.min(userMax, 8);
    return {
      optimalWorkers: optimal,
      minWorkers: 6,
      maxWorkers: 24,
      initialChunkSizeBytes: 16 * 1024 * 1024,
      reason: `Multi-gigabyte payload (${(mb / 1024).toFixed(1)} GB): High-throughput parallel fabric enabled.`,
    };
  }
}
