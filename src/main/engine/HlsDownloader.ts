import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { DownloadItem, SegmentInfo } from '../../shared/types';
import { TokenBucketRateLimiter } from './RateLimiter';

export class HlsDownloader extends EventEmitter {
  private item: DownloadItem;
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
    this.lastCalcTime = Date.now();

    this.log('info', `Fetching HLS playlist from "${this.item.url}"`);

    try {
      if (!fs.existsSync(this.item.destinationDir)) {
        fs.mkdirSync(this.item.destinationDir, { recursive: true });
      }

      // Fetch playlist
      const playlistText = await this.fetchText(this.item.url);
      const segmentUrls = this.parseM3U8(playlistText, this.item.url);

      if (segmentUrls.length === 0) {
        throw new Error('No media segments found in HLS playlist.');
      }

      this.log('info', `Discovered ${segmentUrls.length} HLS media segments.`);

      // Setup segment states
      this.item.segments = segmentUrls.map((sUrl, idx) => ({
        id: idx + 1,
        startOffset: idx,
        endOffset: segmentUrls.length,
        downloadedBytes: 0,
        currentOffset: idx,
        status: 'pending',
        connectionId: (idx % (this.item.maxConnections || 4)) + 1,
        speed: 0,
      }));

      // Stream file output
      const outStream = fs.createWriteStream(this.item.tempPath, { flags: 'a' });

      // Download segments in chunks
      const concurrency = Math.min(this.item.maxConnections || 4, 8);
      for (let i = 0; i < segmentUrls.length; i += concurrency) {
        if (this.isPaused || this.isCancelled) break;

        const batch = segmentUrls.slice(i, i + concurrency);
        this.item.activeConnections = batch.length;

        const buffers = await Promise.all(
          batch.map(async (segUrl, bIdx) => {
            const segItem = this.item.segments[i + bIdx];
            if (segItem) segItem.status = 'downloading';
            const buf = await this.fetchBuffer(segUrl);
            if (segItem) {
              segItem.downloadedBytes = buf.length;
              segItem.status = 'completed';
            }
            this.item.downloadedBytes += buf.length;
            this.bytesSinceLastCalc += buf.length;
            this.calculateSpeedAndEta(i + bIdx + 1, segmentUrls.length);
            this.emitProgressThrottled();
            return buf;
          })
        );

        for (const buf of buffers) {
          outStream.write(buf);
        }
      }

      outStream.end(() => {
        this.item.activeConnections = 0;
        if (!this.isPaused && !this.isCancelled) {
          this.finalizeCompletion();
        }
      });
    } catch (err: any) {
      if (this.isPaused || this.isCancelled) return;
      this.handleError(err);
    }
  }

  private parseM3U8(content: string, baseUrl: string): string[] {
    const lines = content.split(/\r?\n/);
    const urls: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      try {
        const absUrl = new URL(line, baseUrl).href;
        urls.push(absUrl);
      } catch {
        // ignore
      }
    }

    return urls;
  }

  private async fetchText(targetUrl: string): Promise<string> {
    const buf = await this.fetchBuffer(targetUrl);
    return buf.toString('utf8');
  }

  private async fetchBuffer(targetUrl: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(targetUrl, { timeout: 15000 }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
          res.headers.location
        ) {
          const redirect = new URL(res.headers.location, targetUrl).href;
          this.fetchBuffer(redirect).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} loading segment`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Segment fetch timeout')));
    });
  }

  private calculateSpeedAndEta(completedSegments: number, totalSegments: number): void {
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

      this.item.progress = Math.round((completedSegments / totalSegments) * 10000) / 100;

      // Estimate total size based on segment average
      if (completedSegments > 0) {
        const avgSegmentBytes = this.item.downloadedBytes / completedSegments;
        this.item.totalBytes = Math.round(avgSegmentBytes * totalSegments);
        const remainingBytes = Math.max(0, this.item.totalBytes - this.item.downloadedBytes);
        this.item.eta = avg > 0 ? Math.ceil(remainingBytes / avg) : 0;
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
    this.log('info', 'HLS stream download paused');
    this.emit('progress', this.item);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.item.status = 'cancelled';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.log('info', 'HLS stream download cancelled');
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

    this.log('info', 'HLS stream download completed successfully!');
    this.emit('completed', this.item);
  }

  private handleError(err: Error): void {
    this.item.status = 'failed';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.item.error = {
      code: 'ERR_HLS_FAILED',
      message: err.message,
      technicalDetails: err.stack,
      timestamp: Date.now(),
      retryable: true,
      retryCount: this.item.retryCount,
    };
    this.log('error', `HLS download failed: ${err.message}`);
    this.emit('error', err, this.item);
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const logEntry = { timestamp: Date.now(), level, message };
    this.item.logs.push(logEntry);
    if (this.item.logs.length > 200) this.item.logs.shift();
    this.emit('log', level, message);
  }
}
