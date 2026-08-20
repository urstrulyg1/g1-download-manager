import * as fs from 'fs';
import { EventEmitter } from 'events';
import { Client as FtpClient } from 'basic-ftp';
import { DownloadItem } from '../../shared/types';
import { TokenBucketRateLimiter } from './RateLimiter';

export class FtpDownloader extends EventEmitter {
  private item: DownloadItem;
  private client: FtpClient | null = null;
  private isPaused = false;
  private isCancelled = false;
  private rateLimiter: TokenBucketRateLimiter;
  private lastProgressEmit = 0;
  private bytesSinceLastCalc = 0;
  private lastCalcTime = Date.now();
  private speedWindow: number[] = [];

  constructor(item: DownloadItem, rateLimiter?: TokenBucketRateLimiter) {
    super();
    this.item = item;
    this.rateLimiter = rateLimiter || new TokenBucketRateLimiter(item.speedLimitBytesPerSec);
  }

  public async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;
    this.item.status = 'downloading';
    this.item.startedAt = this.item.startedAt || Date.now();
    this.item.activeConnections = 1;
    this.lastCalcTime = Date.now();

    this.log('info', `Connecting to FTP server for "${this.item.filename}"`);

    const parsed = new URL(this.item.url);
    this.client = new FtpClient(30000);
    this.client.ftp.verbose = false;

    try {
      if (!fs.existsSync(this.item.destinationDir)) {
        fs.mkdirSync(this.item.destinationDir, { recursive: true });
      }

      await this.client.access({
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 21,
        user: this.item.auth?.username || parsed.username || 'anonymous',
        password: this.item.auth?.password || parsed.password || 'anonymous@',
        secure: parsed.protocol === 'ftps:',
      });

      const remotePath = parsed.pathname;
      if (this.item.totalBytes <= 0) {
        const size = await this.client.size(remotePath).catch(() => -1);
        if (size > 0) this.item.totalBytes = size;
      }

      // Check existing partial download offset
      let startOffset = 0;
      if (fs.existsSync(this.item.tempPath)) {
        startOffset = fs.statSync(this.item.tempPath).size;
        this.item.downloadedBytes = startOffset;
      }

      const outStream = fs.createWriteStream(this.item.tempPath, {
        flags: startOffset > 0 ? 'a' : 'w',
      });

      this.client.trackProgress((info) => {
        if (this.isPaused || this.isCancelled) return;
        const delta = info.bytes - (this.item.downloadedBytes - startOffset);
        if (delta > 0) {
          this.item.downloadedBytes += delta;
          this.bytesSinceLastCalc += delta;
          this.calculateSpeedAndEta();
          this.emitProgressThrottled();
        }
      });

      await this.client.downloadTo(outStream, remotePath, startOffset);

      if (!this.isPaused && !this.isCancelled) {
        outStream.end(() => {
          this.finalizeCompletion();
        });
      }
    } catch (err: any) {
      if (this.isPaused || this.isCancelled) return;
      this.handleError(err);
    } finally {
      if (this.client) {
        this.client.close();
        this.client = null;
      }
    }
  }

  private calculateSpeedAndEta(): void {
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
    this.item.status = 'paused';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.log('info', 'FTP download paused');
    this.emit('progress', this.item);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.item.status = 'cancelled';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.log('info', 'FTP download cancelled');
    this.emit('progress', this.item);
  }

  private finalizeCompletion(): void {
    try {
      if (fs.existsSync(this.item.tempPath)) {
        fs.renameSync(this.item.tempPath, this.item.finalPath);
      }
    } catch (err: any) {
      this.log('error', `Failed to finalize file: ${err.message}`);
    }

    this.item.status = 'completed';
    this.item.progress = 100;
    this.item.speed = 0;
    this.item.eta = 0;
    this.item.activeConnections = 0;
    this.item.completedAt = Date.now();
    this.item.durationMs = this.item.startedAt ? this.item.completedAt - this.item.startedAt : 0;

    this.log('info', 'FTP download completed successfully!');
    this.emit('completed', this.item);
  }

  private handleError(err: Error): void {
    this.item.status = 'failed';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.item.error = {
      code: 'ERR_FTP_FAILED',
      message: err.message,
      technicalDetails: err.stack,
      timestamp: Date.now(),
      retryable: true,
      retryCount: this.item.retryCount,
    };
    this.log('error', `FTP download failed: ${err.message}`);
    this.emit('error', err, this.item);
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const logEntry = { timestamp: Date.now(), level, message };
    this.item.logs.push(logEntry);
    if (this.item.logs.length > 200) this.item.logs.shift();
    this.emit('log', level, message);
  }
}
