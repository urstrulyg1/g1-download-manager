import { EventEmitter } from 'events';

export interface StallEvent {
  downloadId: string;
  segmentId?: number;
  connectionId?: number;
  durationMs: number;
  stallType: 'SERVER_STALL' | 'NETWORK_STALL' | 'CONNECTION_STALL' | 'DISK_STALL';
  lastByteOffset: number;
}

export class StallDetector extends EventEmitter {
  private lastActivityTimestamps: Map<string, { time: number; bytes: number; lastOffset: number }> = new Map();
  private stallThresholdMs: number;
  private checkIntervalMs: number;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(stallThresholdMs: number = 8000, checkIntervalMs: number = 1000) {
    super();
    this.stallThresholdMs = stallThresholdMs;
    this.checkIntervalMs = checkIntervalMs;
  }

  public start(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => this.checkStalls(), this.checkIntervalMs);
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  public recordActivity(key: string, currentOffset: number): void {
    const now = Date.now();
    this.lastActivityTimestamps.set(key, { time: now, bytes: 0, lastOffset: currentOffset });
  }

  public removeKey(key: string): void {
    this.lastActivityTimestamps.delete(key);
  }

  public checkStalls(): void {
    const now = Date.now();

    for (const [key, state] of this.lastActivityTimestamps.entries()) {
      const elapsed = now - state.time;
      if (elapsed >= this.stallThresholdMs) {
        // Parse key e.g. "dl_123:1"
        const parts = key.split(':');
        const downloadId = parts[0];
        const segmentId = parts[1] ? parseInt(parts[1], 10) : undefined;

        const event: StallEvent = {
          downloadId,
          segmentId,
          durationMs: elapsed,
          stallType: 'CONNECTION_STALL',
          lastByteOffset: state.lastOffset,
        };

        this.emit('stall', event);
        // Bump timestamp to avoid spamming
        state.time = now;
      }
    }
  }
}
