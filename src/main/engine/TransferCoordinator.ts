import { EventEmitter } from 'events';
import { SegmentLedger, LedgerSegment } from './SegmentLedger';
import { TransferWorkerPool, TransferWorkerInfo } from './TransferWorkerPool';
import { ParallelFileWriter } from '../storage/ParallelFileWriter';
import { TokenBucketRateLimiter } from './RateLimiter';

export interface CoordinatorProgress {
  totalBytes: number;
  completedBytes: number;
  progressPct: number;
  aggregateThroughput: number;
  activeWorkersCount: number;
  diskWriteThroughput: number;
}

export class TransferCoordinator extends EventEmitter {
  private ledger: SegmentLedger;
  private workerPool: TransferWorkerPool;
  private fileWriter: ParallelFileWriter;
  private rateLimiter: TokenBucketRateLimiter;
  private downloadId: string;
  private isPaused = false;
  private isCancelled = false;

  constructor(
    downloadId: string,
    ledger: SegmentLedger,
    workerPool: TransferWorkerPool,
    fileWriter: ParallelFileWriter,
    rateLimiter: TokenBucketRateLimiter
  ) {
    super();
    this.downloadId = downloadId;
    this.ledger = ledger;
    this.workerPool = workerPool;
    this.fileWriter = fileWriter;
    this.rateLimiter = rateLimiter;
  }

  public async onWorkerChunkReceived(
    workerId: string,
    segmentId: number,
    offset: number,
    data: Buffer,
    workerThroughput: number
  ): Promise<void> {
    if (this.isPaused || this.isCancelled) return;

    // Rate Limiter check
    if (this.rateLimiter.getLimit() > 0) {
      await this.rateLimiter.acquire(data.length);
    }

    // Direct write to disk writer
    await this.fileWriter.enqueueWrite(segmentId, offset, data);

    // Ledger progress update
    this.ledger.updateProgress(segmentId, data.length);
    this.workerPool.recordWorkerBytes(workerId, data.length, workerThroughput);

    this.emitProgress();
  }

  public handleWorkerFailure(workerId: string, segmentId: number, error: Error): void {
    this.workerPool.updateWorkerState(workerId, 'FAILED', error.message);
    this.ledger.markFailed(segmentId, error.message);
    this.emit('worker_failed_isolated', { workerId, segmentId, error: error.message });

    // Release segment so another worker can claim it
    this.ledger.releaseClaim(segmentId);
  }

  public handleWorkerCompleted(workerId: string, segmentId: number): void {
    this.workerPool.updateWorkerState(workerId, 'IDLE');
    this.ledger.markCompleted(segmentId);

    // Check if work stealing is possible
    const uncompleted = this.ledger.getSegments().find((s) => s.status === 'DOWNLOADING');
    if (uncompleted) {
      const stolen = this.ledger.claimWorkSteal(uncompleted.segmentId, workerId);
      if (stolen) {
        this.emit('dispatch_stolen_work', { workerId, segment: stolen });
      }
    }

    if (this.ledger.isAllCompleted()) {
      this.emit('all_segments_completed');
    }
  }

  private emitProgress(): void {
    const segments = this.ledger.getSegments();
    const completed = segments.reduce((sum, s) => sum + s.bytesCompleted, 0);
    const workers = this.workerPool.getAllWorkers(this.downloadId);
    const active = workers.filter((w) => w.status === 'ACTIVE');
    const totalSpeed = active.reduce((sum, w) => sum + w.throughput, 0);
    const writerMetrics = this.fileWriter.getMetrics();

    this.emit('progress', {
      totalBytes: segments.reduce((sum, s) => sum + (s.endOffset - s.startOffset + 1), 0),
      completedBytes: completed,
      progressPct: segments.length > 0 ? (completed / (segments.reduce((sum, s) => sum + (s.endOffset - s.startOffset + 1), 0) || 1)) * 100 : 0,
      aggregateThroughput: totalSpeed,
      activeWorkersCount: active.length,
      diskWriteThroughput: writerMetrics.diskWriteThroughputBytesPerSec,
    } as CoordinatorProgress);
  }

  public pause(): void {
    this.isPaused = true;
    for (const w of this.workerPool.getAllWorkers(this.downloadId)) {
      this.workerPool.updateWorkerState(w.workerId, 'STOPPING');
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    for (const w of this.workerPool.getAllWorkers(this.downloadId)) {
      this.workerPool.updateWorkerState(w.workerId, 'STOPPING');
    }
  }
}
