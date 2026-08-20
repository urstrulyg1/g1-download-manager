import * as fs from 'fs';
import { EventEmitter } from 'events';

export interface WriteTask {
  offset: number;
  data: Buffer;
  segmentId: number;
}

export interface StoragePerformanceMetrics {
  diskWriteThroughputBytesPerSec: number;
  writeQueueDepthBytes: number;
  writeQueueLength: number;
  averageWriteLatencyMs: number;
  isBackpressureActive: boolean;
}

export class ParallelFileWriter extends EventEmitter {
  private filePath: string;
  private fileFd: number | null = null;
  private writeQueue: WriteTask[] = [];
  private currentQueueBytes = 0;
  private readonly maxQueueBytes: number;
  private isProcessing = false;
  private isBackpressure = false;
  private totalBytesWritten = 0;
  private writeStart = Date.now();
  private writeLatencies: number[] = [];

  constructor(filePath: string, maxQueueBytes = 16 * 1024 * 1024) {
    super();
    this.filePath = filePath;
    this.maxQueueBytes = maxQueueBytes;
  }

  public open(totalPreallocateBytes?: number): void {
    if (this.fileFd === null) {
      if (!fs.existsSync(this.filePath)) {
        this.fileFd = fs.openSync(this.filePath, 'w+');
        if (totalPreallocateBytes && totalPreallocateBytes > 0) {
          try {
            fs.ftruncateSync(this.fileFd, totalPreallocateBytes);
          } catch {}
        }
      } else {
        this.fileFd = fs.openSync(this.filePath, 'r+');
      }
    }
  }

  public async enqueueWrite(segmentId: number, offset: number, data: Buffer): Promise<void> {
    this.writeQueue.push({ segmentId, offset, data });
    this.currentQueueBytes += data.length;

    // Check backpressure threshold
    if (this.currentQueueBytes >= this.maxQueueBytes && !this.isBackpressure) {
      this.isBackpressure = true;
      this.emit('backpressure_applied', { queueBytes: this.currentQueueBytes });
    }

    if (!this.isProcessing) {
      this.processQueue();
    }

    // If backpressure is active, wait briefly to relieve memory pressure
    if (this.isBackpressure) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!this.isBackpressure) resolve();
          else setTimeout(check, 10);
        };
        check();
      });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) return;
    this.isProcessing = true;

    while (this.writeQueue.length > 0) {
      const task = this.writeQueue.shift();
      if (!task || this.fileFd === null) continue;

      const tStart = Date.now();
      try {
        fs.writeSync(this.fileFd, task.data, 0, task.data.length, task.offset);
        this.totalBytesWritten += task.data.length;
      } catch (err: any) {
        this.emit('error', err);
      }
      const latency = Date.now() - tStart;
      this.writeLatencies.push(latency);
      if (this.writeLatencies.length > 20) this.writeLatencies.shift();

      this.currentQueueBytes = Math.max(0, this.currentQueueBytes - task.data.length);

      if (this.isBackpressure && this.currentQueueBytes < this.maxQueueBytes * 0.5) {
        this.isBackpressure = false;
        this.emit('backpressure_released', { queueBytes: this.currentQueueBytes });
      }
    }

    this.isProcessing = false;
  }

  public getMetrics(): StoragePerformanceMetrics {
    const elapsedSec = Math.max(0.1, (Date.now() - this.writeStart) / 1000);
    const throughput = Math.round(this.totalBytesWritten / elapsedSec);
    const avgLatency =
      this.writeLatencies.length > 0
        ? Math.round(this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length)
        : 0;

    return {
      diskWriteThroughputBytesPerSec: throughput,
      writeQueueDepthBytes: this.currentQueueBytes,
      writeQueueLength: this.writeQueue.length,
      averageWriteLatencyMs: avgLatency,
      isBackpressureActive: this.isBackpressure,
    };
  }

  public async flushAndClose(): Promise<void> {
    while (this.writeQueue.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }

    if (this.fileFd !== null) {
      try {
        fs.fsyncSync(this.fileFd);
        fs.closeSync(this.fileFd);
      } catch {}
      this.fileFd = null;
    }
  }
}
