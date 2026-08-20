import { EventEmitter } from 'events';

export type WorkerState =
  | 'IDLE'
  | 'STARTING'
  | 'ACTIVE'
  | 'STALLED'
  | 'RETRYING'
  | 'DRAINING'
  | 'STOPPING'
  | 'FAILED';

export interface TransferWorkerInfo {
  workerId: string;
  connectionId: number;
  downloadId: string;
  segmentId?: number;
  protocol: string;
  status: WorkerState;
  startedAt: number;
  lastActivity: number;
  bytesDownloaded: number;
  throughput: number; // bytes/sec
  rttMs: number;
  retryCount: number;
  productivityScore: number; // 0 - 100%
  errorState?: string;
}

export class TransferWorkerPool extends EventEmitter {
  private workers: Map<string, TransferWorkerInfo> = new Map();
  private maxWorkers: number;

  constructor(maxWorkers = 32) {
    super();
    this.maxWorkers = maxWorkers;
  }

  public registerWorker(workerId: string, connectionId: number, downloadId: string, protocol = 'HTTP/2'): TransferWorkerInfo {
    const info: TransferWorkerInfo = {
      workerId,
      connectionId,
      downloadId,
      protocol,
      status: 'IDLE',
      startedAt: Date.now(),
      lastActivity: Date.now(),
      bytesDownloaded: 0,
      throughput: 0,
      rttMs: 30,
      retryCount: 0,
      productivityScore: 100,
    };

    this.workers.set(workerId, info);
    this.emit('worker_registered', info);
    return info;
  }

  public updateWorkerState(workerId: string, state: WorkerState, error?: string): void {
    const w = this.workers.get(workerId);
    if (!w) return;

    w.status = state;
    w.lastActivity = Date.now();
    if (error) w.errorState = error;
    this.emit('worker_state_changed', { workerId, state });
  }

  public recordWorkerBytes(workerId: string, bytes: number, throughput: number, rttMs = 30): void {
    const w = this.workers.get(workerId);
    if (!w) return;

    w.bytesDownloaded += bytes;
    w.throughput = throughput;
    w.rttMs = rttMs;
    w.lastActivity = Date.now();
    w.status = 'ACTIVE';

    // Productivity score based on throughput (100% if > 500KB/s)
    w.productivityScore = Math.min(100, Math.max(10, Math.round((throughput / (500 * 1024)) * 100)));
  }

  public getWorker(workerId: string): TransferWorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  public getAllWorkers(downloadId?: string): TransferWorkerInfo[] {
    const list = Array.from(this.workers.values());
    if (downloadId) {
      return list.filter((w) => w.downloadId === downloadId);
    }
    return list;
  }

  public getIdleWorkers(downloadId?: string): TransferWorkerInfo[] {
    return this.getAllWorkers(downloadId).filter((w) => w.status === 'IDLE');
  }

  public removeWorker(workerId: string): void {
    this.workers.delete(workerId);
    this.emit('worker_removed', { workerId });
  }

  public clear(): void {
    this.workers.clear();
  }
}
