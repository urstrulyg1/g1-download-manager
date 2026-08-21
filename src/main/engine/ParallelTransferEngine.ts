import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import { DownloadItem } from '../../shared/types';
import { SegmentLedger, LedgerSegment } from './SegmentLedger';
import { TransferWorkerPool } from './TransferWorkerPool';
import { TransferCoordinator } from './TransferCoordinator';
import { ParallelFileWriter } from '../storage/ParallelFileWriter';
import { WorkScheduler } from './WorkScheduler';
import { TokenBucketRateLimiter } from './RateLimiter';
import { TlsPolicy } from '../security/TlsPolicy';

export class ParallelTransferEngine extends EventEmitter {
  private item: DownloadItem;
  private ledger: SegmentLedger;
  private workerPool: TransferWorkerPool;
  private fileWriter: ParallelFileWriter;
  private coordinator: TransferCoordinator;
  private rateLimiter: TokenBucketRateLimiter;
  private isPaused = false;
  private isCancelled = false;

  constructor(item: DownloadItem, rateLimiter?: TokenBucketRateLimiter) {
    super();
    this.item = item;
    this.rateLimiter = rateLimiter || new TokenBucketRateLimiter(item.speedLimitBytesPerSec);

    this.ledger = new SegmentLedger(item.id, item.totalBytes);
    this.workerPool = new TransferWorkerPool(32);
    this.fileWriter = new ParallelFileWriter(item.tempPath, 16 * 1024 * 1024);
    this.coordinator = new TransferCoordinator(
      item.id,
      this.ledger,
      this.workerPool,
      this.fileWriter,
      this.rateLimiter
    );
  }

  public async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;

    // Calculate optimal concurrency
    const recommendation = WorkScheduler.calculateOptimalWorkers({
      totalBytes: this.item.totalBytes,
      rangeSupport: this.item.serverCapabilities.supportsRange,
      protocol: this.item.serverCapabilities.protocol === 'https' ? 'HTTP/2' : 'HTTP/1.1',
      userMaxConnections: this.item.maxConnections || 8,
    });

    this.fileWriter.open(this.item.totalBytes);

    const initialSegments = this.ledger.initialize(recommendation.optimalWorkers);

    // Register workers in the worker pool
    const workerPromises = initialSegments.map((seg, idx) => {
      const workerId = `w_${this.item.id}_${idx + 1}`;
      this.workerPool.registerWorker(workerId, idx + 1, this.item.id, 'HTTP/2');
      return this.spawnWorker(workerId, seg);
    });

    this.coordinator.on('progress', (prog) => {
      this.item.downloadedBytes = prog.completedBytes;
      this.item.speed = prog.aggregateThroughput;
      this.emit('progress', this.item);
    });

    this.coordinator.on('all_segments_completed', async () => {
      await this.fileWriter.flushAndClose();
      this.emit('completed', this.item);
    });

    await Promise.all(workerPromises);
  }

  private async spawnWorker(workerId: string, segment: LedgerSegment): Promise<void> {
    if (this.isPaused || this.isCancelled) return;

    this.ledger.claimNextAvailable(workerId);
    this.workerPool.updateWorkerState(workerId, 'ACTIVE');

    const targetUrl = this.item.url;
    const parsed = new URL(targetUrl);
    const reqMod = parsed.protocol === 'https:' ? https : http;

    return new Promise<void>((resolve) => {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) G1DM-Parallel/2.0',
        'Accept': '*/*',
        ...(segment.endOffset !== -1 ? { Range: `bytes=${segment.startOffset}-${segment.endOffset}` } : {}),
      };

      const req = reqMod.get(targetUrl, { headers, timeout: 20000, rejectUnauthorized: TlsPolicy.rejectUnauthorized() }, (res) => {
        let bytesThisSec = 0;
        let lastSec = Date.now();

        res.on('data', async (chunk: Buffer) => {
          if (this.isPaused || this.isCancelled) {
            res.destroy();
            return;
          }

          bytesThisSec += chunk.length;
          const now = Date.now();
          let speed = 0;
          if (now - lastSec >= 1000) {
            speed = Math.round((bytesThisSec * 1000) / (now - lastSec));
            bytesThisSec = 0;
            lastSec = now;
          }

          await this.coordinator.onWorkerChunkReceived(workerId, segment.segmentId, segment.currentOffset, chunk, speed);
          segment.currentOffset += chunk.length;
        });

        res.on('end', () => {
          this.coordinator.handleWorkerCompleted(workerId, segment.segmentId);
          resolve();
        });

        res.on('error', (err) => {
          this.coordinator.handleWorkerFailure(workerId, segment.segmentId, err);
          resolve();
        });
      });

      req.on('error', (err) => {
        this.coordinator.handleWorkerFailure(workerId, segment.segmentId, err);
        resolve();
      });
    });
  }

  public getLedger(): SegmentLedger {
    return this.ledger;
  }

  public getWorkerPool(): TransferWorkerPool {
    return this.workerPool;
  }

  public pause(): void {
    this.isPaused = true;
    this.coordinator.pause();
  }

  public cancel(): void {
    this.isCancelled = true;
    this.coordinator.cancel();
  }
}
