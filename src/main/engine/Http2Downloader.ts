import * as http2 from 'http2';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { DownloadItem, SegmentInfo } from '../../shared/types';
import { TokenBucketRateLimiter } from './RateLimiter';
import { DynamicSegmentScheduler, DetailedSegmentState } from './DynamicSegmentScheduler';
import { TlsPolicy } from '../security/TlsPolicy';

export class Http2Downloader extends EventEmitter {
  private item: DownloadItem;
  private session: http2.ClientHttp2Session | null = null;
  private isPaused = false;
  private isCancelled = false;
  private isCompleted = false;
  private fileFd: number | null = null;
  private rateLimiter: TokenBucketRateLimiter;
  private scheduler: DynamicSegmentScheduler;
  private activeStreams: Map<number, http2.ClientHttp2Stream> = new Map();
  private lastProgressEmit = 0;
  private bytesSinceLastCalc = 0;
  private lastCalcTime = Date.now();
  private speedWindow: number[] = [];

  constructor(item: DownloadItem, rateLimiter?: TokenBucketRateLimiter) {
    super();
    this.item = item;
    this.rateLimiter = rateLimiter || new TokenBucketRateLimiter(item.speedLimitBytesPerSec);
    this.scheduler = new DynamicSegmentScheduler(item.totalBytes, item.segments);
  }

  public async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;
    this.isCompleted = false;
    this.item.startedAt = this.item.startedAt || Date.now();
    this.lastCalcTime = Date.now();

    const targetUrl = this.getLatestUrl();
    const parsed = new URL(targetUrl);

    try {
      if (!fs.existsSync(this.item.destinationDir)) {
        fs.mkdirSync(this.item.destinationDir, { recursive: true });
      }

      if (!fs.existsSync(this.item.tempPath)) {
        this.fileFd = fs.openSync(this.item.tempPath, 'w+');
        if (this.item.totalBytes > 0) {
          try {
            fs.ftruncateSync(this.fileFd, this.item.totalBytes);
          } catch {}
        }
      } else {
        this.fileFd = fs.openSync(this.item.tempPath, 'r+');
      }

      // Establish multiplexed HTTP/2 session
      this.session = http2.connect(parsed.origin, {
        rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
      });

      this.session.on('error', (err) => {
        this.log('warn', `HTTP/2 session error: ${err.message}`);
      });

      const maxConns = Math.min(this.item.maxConnections || 8, 16);
      const segments = this.scheduler.initializeSegments(maxConns);
      this.item.segments = segments;

      this.log('info', `HTTP/2 Multiplexed session opened. Spawning ${segments.length} concurrent streams.`);

      const streamPromises = segments.map((seg) => this.downloadSegmentStream(seg));
      await Promise.all(streamPromises);

      if (this.scheduler.isAllCompleted() && !this.isPaused && !this.isCancelled) {
        this.finalizeCompletion();
      }
    } catch (err: any) {
      if (this.isPaused || this.isCancelled) return;
      this.handleError(err);
    }
  }

  private async downloadSegmentStream(segment: DetailedSegmentState): Promise<void> {
    if (this.isPaused || this.isCancelled || !this.session || this.session.destroyed) return;
    if (segment.status === 'completed') return;

    segment.status = 'downloading';
    this.updateActiveConnections();

    const parsed = new URL(this.getLatestUrl());
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    const startByte = segment.currentOffset;
    const endByte = segment.endOffset;

    if (startByte > endByte && endByte !== -1) {
      segment.status = 'completed';
      this.checkWorkSteal(segment.connectionId);
      return;
    }

    return new Promise<void>((resolve) => {
      const headers: Record<string, string> = {
        ':method': 'GET',
        ':path': pathAndQuery,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'accept': '*/*',
        ...(endByte !== -1 ? { 'range': `bytes=${startByte}-${endByte}` } : {}),
      };

      const stream = this.session!.request(headers);
      this.activeStreams.set(segment.id, stream);

      let bytesThisSec = 0;
      let lastSec = Date.now();

      stream.on('response', (resHeaders) => {
        const status = Number(resHeaders[':status'] || 200);
        if (status >= 400) {
          this.log('warn', `HTTP/2 stream ${segment.id} returned status ${status}`);
        }
      });

      stream.on('data', async (chunk: Buffer) => {
        if (this.isPaused || this.isCancelled) {
          stream.close();
          return;
        }

        if (this.rateLimiter.getLimit() > 0) {
          await this.rateLimiter.acquire(chunk.length);
        }

        if (this.fileFd !== null) {
          try {
            fs.writeSync(this.fileFd, chunk, 0, chunk.length, segment.currentOffset);
          } catch (err: any) {
            console.error('File write error:', err);
          }
        }

        const len = chunk.length;
        this.scheduler.updateSegmentProgress(segment.id, len, segment.speed);
        this.item.downloadedBytes += len;
        this.bytesSinceLastCalc += len;

        bytesThisSec += len;
        const now = Date.now();
        if (now - lastSec >= 1000) {
          segment.speed = Math.round((bytesThisSec * 1000) / (now - lastSec));
          bytesThisSec = 0;
          lastSec = now;
        }

        this.calculateGlobalSpeed();
        this.emitProgressThrottled();
      });

      stream.on('end', () => {
        this.activeStreams.delete(segment.id);
        segment.speed = 0;

        if (segment.currentOffset > segment.endOffset || segment.currentOffset === segment.endOffset + 1 || (segment.endOffset === -1 && segment.downloadedBytes > 0)) {
          segment.status = 'completed';
          this.scheduler.markSegmentCompleted(segment.id);
        } else {
          segment.status = 'failed';
          this.scheduler.markSegmentFailed(segment.id, 'Incomplete stream transfer');
        }

        this.updateActiveConnections();
        this.checkWorkSteal(segment.connectionId);

        if (this.scheduler.isAllCompleted() && !this.isPaused && !this.isCancelled) {
          this.finalizeCompletion();
        }
        resolve();
      });

      stream.on('error', (err) => {
        this.activeStreams.delete(segment.id);
        segment.status = 'failed';
        this.scheduler.markSegmentFailed(segment.id, err.message);
        this.updateActiveConnections();
        resolve();
      });
    });
  }

  private checkWorkSteal(idleConnId: number): void {
    if (this.isPaused || this.isCancelled) return;
    const stolenSegment = this.scheduler.attemptWorkSteal(idleConnId);
    if (stolenSegment) {
      this.item.segments = this.scheduler.getSegments();
      this.log('info', `HTTP/2 Work Stealing: Stole range for stream ${stolenSegment.id} [${stolenSegment.startOffset} - ${stolenSegment.endOffset}]`);
      this.downloadSegmentStream(stolenSegment);
    }
  }

  private updateActiveConnections(): void {
    this.item.activeConnections = this.activeStreams.size;
  }

  private calculateGlobalSpeed(): void {
    const now = Date.now();
    const elapsed = (now - this.lastCalcTime) / 1000;

    if (elapsed >= 0.5) {
      const instSpeed = Math.round(this.bytesSinceLastCalc / elapsed);
      this.item.speed = instSpeed;
      this.bytesSinceLastCalc = 0;
      this.lastCalcTime = now;

      this.speedWindow.push(instSpeed);
      if (this.speedWindow.length > 10) this.speedWindow.shift();
      const avg = Math.round(this.speedWindow.reduce((a, b) => a + b, 0) / this.speedWindow.length);
      this.item.avgSpeed = avg;
      if (instSpeed > this.item.peakSpeed) this.item.peakSpeed = instSpeed;

      if (this.item.totalBytes > 0) {
        this.item.progress = Math.min(100, Math.round((this.item.downloadedBytes / this.item.totalBytes) * 10000) / 100);
        const remaining = Math.max(0, this.item.totalBytes - this.item.downloadedBytes);
        this.item.eta = avg > 0 ? Math.ceil(remaining / avg) : 0;
      }

      this.item.speedHistory.push({ timestamp: now, speed: instSpeed });
      if (this.item.speedHistory.length > 60) this.item.speedHistory.shift();
    }
  }

  private emitProgressThrottled(): void {
    const now = Date.now();
    if (now - this.lastProgressEmit > 200) {
      this.lastProgressEmit = now;
      this.emit('progress', this.item);
    }
  }

  public pause(): void {
    this.isPaused = true;
    this.item.speed = 0;
    this.item.activeConnections = 0;
    for (const s of this.activeStreams.values()) s.close();
    this.activeStreams.clear();
    if (this.session && !this.session.destroyed) this.session.close();
    this.cleanupFd();
    this.emit('progress', this.item);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.item.speed = 0;
    this.item.activeConnections = 0;
    for (const s of this.activeStreams.values()) s.close();
    this.activeStreams.clear();
    if (this.session && !this.session.destroyed) this.session.close();
    this.cleanupFd();
    this.emit('progress', this.item);
  }

  private finalizeCompletion(): void {
    if (this.isCompleted) return;
    this.isCompleted = true;

    this.cleanupFd();
    if (this.session && !this.session.destroyed) this.session.close();

    try {
      if (fs.existsSync(this.item.tempPath)) {
        fs.renameSync(this.item.tempPath, this.item.finalPath);
      }
      if (fs.existsSync(this.item.stateFilePath)) {
        fs.unlinkSync(this.item.stateFilePath);
      }
    } catch (err: any) {
      this.log('error', `Finalize error: ${err.message}`);
    }

    this.item.status = 'completed';
    this.item.progress = 100;
    this.item.speed = 0;
    this.item.eta = 0;
    this.item.activeConnections = 0;
    this.item.completedAt = Date.now();
    this.item.durationMs = this.item.startedAt ? this.item.completedAt - this.item.startedAt : 0;

    this.log('info', `HTTP/2 Multiplexed download completed in ${Math.round(this.item.durationMs / 1000)}s!`);
    this.emit('completed', this.item);
  }

  private handleError(err: Error): void {
    this.cleanupFd();
    if (this.session && !this.session.destroyed) this.session.close();

    this.item.status = 'failed';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.item.error = {
      code: 'ERR_HTTP2_FAILED',
      message: err.message,
      technicalDetails: err.stack,
      timestamp: Date.now(),
      retryable: true,
      retryCount: this.item.retryCount,
    };
    this.emit('error', err, this.item);
  }

  private cleanupFd(): void {
    if (this.fileFd !== null) {
      try {
        fs.closeSync(this.fileFd);
      } catch {}
      this.fileFd = null;
    }
  }

  private getLatestUrl(): string {
    const chain = this.item.serverCapabilities.redirectChain;
    return chain && chain.length > 0 ? chain[chain.length - 1] : this.item.url;
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const logEntry = { timestamp: Date.now(), level, message };
    this.item.logs.push(logEntry);
    if (this.item.logs.length > 200) this.item.logs.shift();
    this.emit('log', level, message);
  }
}
