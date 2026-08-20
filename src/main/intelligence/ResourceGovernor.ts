import * as os from 'os';

export interface ResourceGovernorLimits {
  maxGlobalSockets: number;
  maxMemoryBufferBytes: number;
  maxActiveWorkers: number;
  maxVerificationThreads: number;
  cpuThrottleThresholdPct: number;
}

export interface SystemResourceSnapshot {
  cpuLoadPct: number;
  memoryUsedBytes: number;
  memoryRssBytes: number;
  activeSocketsCount: number;
  openFdCount: number;
  isThrottlingRequired: boolean;
  throttleReason?: string;
}

export class ResourceGovernor {
  private limits: ResourceGovernorLimits = {
    maxGlobalSockets: 64,
    maxMemoryBufferBytes: 64 * 1024 * 1024, // 64 MB
    maxActiveWorkers: 32,
    maxVerificationThreads: 4,
    cpuThrottleThresholdPct: 85,
  };

  public getSnapshot(activeSockets = 0, openFds = 0): SystemResourceSnapshot {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0];
    const cpuPct = Math.min(100, Math.round((loadAvg / (cpus.length || 1)) * 100));

    let isThrottling = false;
    let throttleReason: string | undefined;

    if (cpuPct > this.limits.cpuThrottleThresholdPct) {
      isThrottling = true;
      throttleReason = `High system CPU load (${cpuPct}%). Reducing background concurrency.`;
    } else if (mem.heapUsed > this.limits.maxMemoryBufferBytes * 2) {
      isThrottling = true;
      throttleReason = `Memory pressure (${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB). Applying buffer flush.`;
    } else if (activeSockets >= this.limits.maxGlobalSockets) {
      isThrottling = true;
      throttleReason = `Global socket pool limit reached (${activeSockets}/${this.limits.maxGlobalSockets}).`;
    }

    return {
      cpuLoadPct: cpuPct,
      memoryUsedBytes: mem.heapUsed,
      memoryRssBytes: mem.rss,
      activeSocketsCount: activeSockets,
      openFdCount: openFds,
      isThrottlingRequired: isThrottling,
      throttleReason,
    };
  }

  public getLimits(): ResourceGovernorLimits {
    return { ...this.limits };
  }
}
