import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { DownloadItem, SegmentInfo, DownloadAuth, ProxyConfig } from '../../shared/types';
import { TokenBucketRateLimiter } from './RateLimiter';
import { TlsPolicy } from '../security/TlsPolicy';

export interface HttpDownloaderEvents {
  progress: (item: DownloadItem) => void;
  completed: (item: DownloadItem) => void;
  error: (err: Error, item: DownloadItem) => void;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export class HttpDownloader extends EventEmitter {
  private item: DownloadItem;
  private isPaused = false;
  private isCancelled = false;
  private isCompleted = false;
  private activeSockets: Map<number, http.ClientRequest> = new Map();
  private fileFd: number | null = null;
  private rateLimiter: TokenBucketRateLimiter;
  private lastProgressEmit = 0;
  private bytesSinceLastCalc = 0;
  private lastCalcTime = Date.now();
  private speedWindow: number[] = [];
  private stateFlushTimer: NodeJS.Timeout | null = null;
  private retryTimeouts: Map<number, NodeJS.Timeout> = new Map();

  // Dynamic segmentation tuning
  private minSplitThresholdBytes = 1024 * 1024; // 1MB minimum remaining to warrant splitting
  private nextSegmentId = 1;

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
    this.bytesSinceLastCalc = 0;

    this.log('info', `Starting download for "${this.item.filename}" (${this.item.url})`);

    // Ensure destination directory exists
    if (!fs.existsSync(this.item.destinationDir)) {
      fs.mkdirSync(this.item.destinationDir, { recursive: true });
    }

    try {
      // Open file descriptor for random access read/write
      if (!fs.existsSync(this.item.tempPath)) {
        this.fileFd = fs.openSync(this.item.tempPath, 'w+');
        // Pre-allocate file space if size is known and supported
        if (this.item.totalBytes > 0) {
          try {
            fs.ftruncateSync(this.fileFd, this.item.totalBytes);
          } catch {
            // Ignore ftruncate if filesystem doesn't support pre-grow
          }
        }
      } else {
        this.fileFd = fs.openSync(this.item.tempPath, 'r+');
      }

      // Initialize segments if not present
      if (!this.item.segments || this.item.segments.length === 0) {
        this.initializeSegments();
      } else {
        // Adjust next segment ID
        const maxId = Math.max(...this.item.segments.map((s) => s.id), 0);
        this.nextSegmentId = maxId + 1;
      }

      this.saveState();
      this.startStateFlushTimer();

      // Launch segment downloads
      if (!this.item.serverCapabilities.supportsRange || this.item.totalBytes <= 0) {
        // Single stream download
        this.log('info', 'Server does not support range requests or size is unknown. Falling back to single-stream download.');
        await this.downloadSingleStream();
      } else {
        this.log('info', `Starting dynamic multi-connection download with ${this.item.segments.length} segment(s).`);
        await this.runSegmentEngine();
      }
    } catch (err: any) {
      if (this.isPaused || this.isCancelled) return;
      this.handleDownloadError(err);
    }
  }

  private initializeSegments(): void {
    const total = this.item.totalBytes;
    const maxConns = Math.min(this.item.maxConnections || 8, 32);

    if (!this.item.serverCapabilities.supportsRange || total <= 0) {
      this.item.segments = [
        {
          id: 1,
          startOffset: 0,
          endOffset: total > 0 ? total - 1 : -1,
          downloadedBytes: 0,
          currentOffset: 0,
          status: 'pending',
          connectionId: 1,
          speed: 0,
        },
      ];
      this.nextSegmentId = 2;
      return;
    }

    // Adaptive initial connection count based on file size
    let initialConns = 1;
    if (total > 50 * 1024 * 1024) {
      initialConns = Math.min(maxConns, 8);
    } else if (total > 10 * 1024 * 1024) {
      initialConns = Math.min(maxConns, 4);
    } else if (total > 2 * 1024 * 1024) {
      initialConns = Math.min(maxConns, 2);
    } else {
      initialConns = 1;
    }

    const chunkSize = Math.floor(total / initialConns);
    const segments: SegmentInfo[] = [];

    for (let i = 0; i < initialConns; i++) {
      const start = i * chunkSize;
      const end = i === initialConns - 1 ? total - 1 : (i + 1) * chunkSize - 1;
      segments.push({
        id: i + 1,
        startOffset: start,
        endOffset: end,
        downloadedBytes: 0,
        currentOffset: start,
        status: 'pending',
        connectionId: i + 1,
        speed: 0,
      });
    }

    this.item.segments = segments;
    this.nextSegmentId = initialConns + 1;
  }

  private async runSegmentEngine(): Promise<void> {
    const pending = this.item.segments.filter((s) => s.status === 'pending' || s.status === 'downloading' || s.status === 'failed');
    if (pending.length === 0 && this.isAllSegmentsComplete()) {
      this.finalizeCompletion();
      return;
    }

    const workers = this.item.segments.map((seg) => {
      if (seg.status !== 'completed') {
        return this.downloadSegment(seg);
      }
      return Promise.resolve();
    });

    await Promise.all(workers);

    if (this.isAllSegmentsComplete() && !this.isPaused && !this.isCancelled) {
      this.finalizeCompletion();
      return;
    }

    if (!this.isPaused && !this.isCancelled) {
      const hasInFlightWork =
        this.activeSockets.size > 0 ||
        this.item.segments.some((segment) => segment.status === 'pending' || segment.status === 'downloading');

      if (hasInFlightWork) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.runSegmentEngine();
        return;
      }

      const failedSegment = this.item.segments.find((segment) => segment.status === 'failed');
      if (failedSegment) {
        if ((this.item.retryCount || 0) < (this.item.maxRetries || 5)) {
          this.item.retryCount = (this.item.retryCount || 0) + 1;
          this.log(
            'warn',
            `Segment ${failedSegment.id} failed (${failedSegment.error || 'error'}). Retrying (${this.item.retryCount}/${this.item.maxRetries || 5})...`
          );
          for (const s of this.item.segments) {
            if (s.status === 'failed') s.status = 'pending';
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
          await this.runSegmentEngine();
          return;
        }
        this.handleDownloadError(new Error(failedSegment.error || `Segment ${failedSegment.id} failed`));
        return;
      }

      const incompleteSegment = this.item.segments.find((segment) => segment.status !== 'completed');
      if (incompleteSegment) {
        this.handleDownloadError(new Error(`Segment ${incompleteSegment.id} did not complete successfully.`));
      }
    }
  }

  private isAllSegmentsComplete(): boolean {
    if (!this.item.segments || this.item.segments.length === 0) return false;
    return this.item.segments.every((s) => s.status === 'completed');
  }

  private async downloadSegment(segment: SegmentInfo): Promise<void> {
    if (this.isPaused || this.isCancelled) return;
    if (segment.status === 'completed') return;

    segment.status = 'downloading';
    segment.error = undefined;
    this.updateActiveConnectionsCount();

    const startByte = segment.currentOffset;
    const endByte = segment.endOffset;

    if (startByte > endByte) {
      segment.status = 'completed';
      this.checkAndPerformDynamicSplit();
      if (this.isAllSegmentsComplete() && !this.isPaused && !this.isCancelled) {
        this.finalizeCompletion();
      }
      return;
    }

    return new Promise<void>((resolve) => {
      const targetUrl = this.getLatestUrl();
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const reqModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${parsed.protocol}//${parsed.host}/`,
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Range': `bytes=${startByte}-${endByte}`,
        ...(this.item.auth?.customHeaders || {}),
      };

      if (this.item.auth?.cookies) {
        headers['Cookie'] = this.item.auth.cookies;
      }
      if (this.item.auth?.username && this.item.auth?.password) {
        const creds = Buffer.from(`${this.item.auth.username}:${this.item.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      } else if (this.item.auth?.token) {
        headers['Authorization'] = `Bearer ${this.item.auth.token}`;
      }

      let agent: http.Agent | https.Agent | undefined;
      if (this.item.proxy && this.item.proxy.enabled && this.item.proxy.host) {
        const proxyUri = `${this.item.proxy.type}://${this.item.proxy.auth && this.item.proxy.username ? `${this.item.proxy.username}:${this.item.proxy.password}@` : ''}${this.item.proxy.host}:${this.item.proxy.port}`;
        agent = this.item.proxy.type === 'socks5' ? new SocksProxyAgent(proxyUri) : new HttpsProxyAgent(proxyUri);
      }

      const reqOptions: https.RequestOptions = {
        method: 'GET',
        headers,
        timeout: (this.item.maxRetries || 5) * 5000,
        agent,
        rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
      };

      const req = reqModule.request(targetUrl, reqOptions, (res) => {
        const statusCode = res.statusCode || 200;

        // Redirect handling
        if (
          (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) &&
          res.headers.location
        ) {
          const newUrl = new URL(res.headers.location, targetUrl).href;
          this.item.serverCapabilities.redirectChain.push(newUrl);
          res.destroy();
          this.activeSockets.delete(segment.id);
          this.downloadSegment(segment).then(resolve);
          return;
        }

        // Server throttling backoff (429 or 503)
        if (statusCode === 429 || statusCode === 503) {
          this.log('warn', `Server throttled segment ${segment.id} (HTTP ${statusCode}). Backing off.`);
          res.destroy();
          this.activeSockets.delete(segment.id);
          segment.status = 'failed';
          segment.error = `HTTP ${statusCode} Server Throttled`;
          resolve();
          return;
        }

        // Detect if server ignored Range request and sent HTTP 200 for offset > 0
        if (startByte > 0 && statusCode === 200) {
          this.log('warn', `Server returned HTTP 200 for range request on segment ${segment.id} (offset ${startByte}). Range not supported.`);
          res.destroy();
          this.activeSockets.delete(segment.id);
          segment.status = 'failed';
          segment.error = 'Server does not support byte range requests (HTTP 200 returned).';
          this.item.serverCapabilities.supportsRange = false;
          resolve();
          return;
        }

        if (statusCode !== 206 && statusCode !== 200) {
          res.destroy();
          this.activeSockets.delete(segment.id);
          segment.status = 'failed';
          segment.error = `HTTP ${statusCode}`;
          this.log('error', `Segment ${segment.id} failed with HTTP ${statusCode}`);
          resolve();
          return;
        }

        let segmentBytesThisSec = 0;
        let lastSegSec = Date.now();

        res.on('data', async (chunk: Buffer) => {
          try {
            if (this.isPaused || this.isCancelled) {
              res.destroy();
              return;
            }

            // Rate limit acquire
            if (this.rateLimiter.getLimit() > 0) {
              await this.rateLimiter.acquire(chunk.length);
            }

            // Write chunk directly at current offset
            if (this.fileFd !== null) {
              fs.writeSync(this.fileFd, chunk, 0, chunk.length, segment.currentOffset);
            }

            const len = chunk.length;
            segment.currentOffset += len;
            segment.downloadedBytes += len;
            this.item.downloadedBytes += len;
            this.bytesSinceLastCalc += len;

            // Segment speed
            segmentBytesThisSec += len;
            const now = Date.now();
            if (now - lastSegSec >= 1000) {
              segment.speed = Math.round((segmentBytesThisSec * 1000) / (now - lastSegSec));
              segmentBytesThisSec = 0;
              lastSegSec = now;
            }

            this.calculateGlobalSpeedAndEta();
            this.emitProgressThrottled();
          } catch (err: any) {
            console.error('Error in on data handler:', err);
          }
        });

        res.on('end', () => {
          this.activeSockets.delete(segment.id);
          segment.speed = 0;
          if (segment.currentOffset > segment.endOffset || segment.currentOffset === segment.endOffset + 1 || (segment.endOffset === -1 && segment.downloadedBytes > 0)) {
            segment.status = 'completed';
            this.log('info', `Segment ${segment.id} completed [${segment.startOffset} - ${segment.endOffset}]`);
          } else {
            // Segment ended prematurely
            segment.status = 'failed';
            segment.error = 'Incomplete transfer';
          }
          this.updateActiveConnectionsCount();
          this.checkAndPerformDynamicSplit();
          if (this.isAllSegmentsComplete() && !this.isPaused && !this.isCancelled) {
            this.finalizeCompletion();
          }
          resolve();
        });

        res.on('error', (err) => {
          this.activeSockets.delete(segment.id);
          segment.speed = 0;
          segment.status = 'failed';
          segment.error = err.message;
          this.log('warn', `Segment ${segment.id} network error: ${err.message}`);
          this.updateActiveConnectionsCount();
          resolve();
        });
      });

      req.on('error', (err) => {
        this.activeSockets.delete(segment.id);
        segment.speed = 0;
        segment.status = 'failed';
        segment.error = err.message;
        this.updateActiveConnectionsCount();
        resolve();
      });

      this.activeSockets.set(segment.id, req);
      req.end();
    });
  }

  // Single-stream fallback
  private async downloadSingleStream(): Promise<void> {
    const isResuming = this.item.downloadedBytes > 0 && this.item.serverCapabilities.supportsRange;

    // Reset downloaded bytes and truncate temp file only if starting from scratch
    if (!isResuming) {
      this.item.downloadedBytes = 0;
      if (this.fileFd !== null) {
        try {
          fs.ftruncateSync(this.fileFd, 0);
        } catch {}
      }
    }

    return new Promise<void>((resolve, reject) => {
      const targetUrl = this.getLatestUrl();
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const reqModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': `${parsed.protocol}//${parsed.host}/`,
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        ...(this.item.auth?.customHeaders || {}),
      };

      if (isResuming) {
        headers['Range'] = `bytes=${this.item.downloadedBytes}-`;
        if (this.item.serverCapabilities.etag) {
          headers['If-Match'] = this.item.serverCapabilities.etag;
        }
      }

      if (this.item.auth?.cookies) {
        headers['Cookie'] = this.item.auth.cookies;
      }
      if (this.item.auth?.username && this.item.auth?.password) {
        const creds = Buffer.from(`${this.item.auth.username}:${this.item.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      } else if (this.item.auth?.token) {
        headers['Authorization'] = `Bearer ${this.item.auth.token}`;
      }

      let agent: http.Agent | https.Agent | undefined;
      if (this.item.proxy && this.item.proxy.enabled && this.item.proxy.host) {
        const proxyUri = `${this.item.proxy.type}://${this.item.proxy.auth && this.item.proxy.username ? `${this.item.proxy.username}:${this.item.proxy.password}@` : ''}${this.item.proxy.host}:${this.item.proxy.port}`;
        agent = this.item.proxy.type === 'socks5' ? new SocksProxyAgent(proxyUri) : new HttpsProxyAgent(proxyUri);
      }

      const reqOptions: https.RequestOptions = {
        method: 'GET',
        headers,
        timeout: 30000,
        agent,
        rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
      };

      const req = reqModule.request(targetUrl, reqOptions, (res) => {
        const statusCode = res.statusCode || 200;

        if (
          (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) &&
          res.headers.location
        ) {
          const newUrl = new URL(res.headers.location, targetUrl).href;
          this.item.serverCapabilities.redirectChain.push(newUrl);
          res.destroy();
          this.downloadSingleStream().then(resolve).catch(reject);
          return;
        }

        if (statusCode >= 400) {
          res.destroy();
          reject(new Error(`HTTP ${statusCode} ${res.statusMessage || 'Error'}`));
          return;
        }

        // If resume was requested with Range header but server returned HTTP 200 (full body),
        // we must reset downloadedBytes to 0 and truncate temp file to prevent appending & corruption.
        if (isResuming && statusCode === 200) {
          this.log('warn', 'Server returned HTTP 200 for range resume request. Restarting from byte 0 to preserve integrity.');
          this.item.downloadedBytes = 0;
          this.item.serverCapabilities.supportsRange = false;
          if (this.fileFd !== null) {
            try {
              fs.ftruncateSync(this.fileFd, 0);
            } catch {}
          }
        }

        if (this.item.totalBytes <= 0 && res.headers['content-length']) {
          const len = parseInt(res.headers['content-length'], 10);
          this.item.totalBytes = statusCode === 206 ? this.item.downloadedBytes + len : len;
        }

        this.item.activeConnections = 1;

        res.on('data', async (chunk: Buffer) => {
          if (this.isPaused || this.isCancelled) {
            res.destroy();
            return;
          }

          if (this.rateLimiter.getLimit() > 0) {
            await this.rateLimiter.acquire(chunk.length);
          }

          if (this.fileFd !== null) {
            try {
              fs.writeSync(this.fileFd, chunk, 0, chunk.length, this.item.downloadedBytes);
            } catch (err: any) {
              console.error('File write error:', err);
            }
          }

          const len = chunk.length;
          this.item.downloadedBytes += len;
          this.bytesSinceLastCalc += len;

          if (this.item.segments && this.item.segments[0]) {
            this.item.segments[0].downloadedBytes += len;
            this.item.segments[0].currentOffset += len;
          }

          this.calculateGlobalSpeedAndEta();
          this.emitProgressThrottled();
        });

        res.on('end', () => {
          this.item.activeConnections = 0;
          if (!this.isPaused && !this.isCancelled) {
            if (this.item.segments && this.item.segments[0]) {
              this.item.segments[0].status = 'completed';
            }
            this.finalizeCompletion();
            resolve();
          }
        });

        res.on('error', (err) => {
          this.item.activeConnections = 0;
          reject(err);
        });
      });

      req.on('error', (err) => {
        this.item.activeConnections = 0;
        reject(err);
      });

      this.activeSockets.set(1, req);
      req.end();
    });
  }

  // --- Dynamic Segmentation Engine ---

  private checkAndPerformDynamicSplit(): void {
    if (this.isPaused || this.isCancelled) return;
    if (!this.item.serverCapabilities.supportsRange || this.item.totalBytes <= 0) return;

    const maxConns = Math.min(this.item.maxConnections || 8, 32);
    const activeSegments = this.item.segments.filter((s) => s.status === 'downloading');

    if (activeSegments.length >= maxConns) return;

    // Find the downloading segment with the largest remaining bytes
    let candidate: SegmentInfo | null = null;
    let maxRemaining = 0;

    for (const seg of activeSegments) {
      const remaining = seg.endOffset - seg.currentOffset;
      if (remaining > maxRemaining && remaining >= this.minSplitThresholdBytes) {
        maxRemaining = remaining;
        candidate = seg;
      }
    }

    if (!candidate || maxRemaining < this.minSplitThresholdBytes) return;

    // Perform split: Candidate keeps lower half, new segment takes upper half
    const half = Math.floor(maxRemaining / 2);
    const originalEnd = candidate.endOffset;
    const splitPoint = candidate.currentOffset + half;

    candidate.endOffset = splitPoint;

    const newSegment: SegmentInfo = {
      id: this.nextSegmentId++,
      startOffset: splitPoint + 1,
      endOffset: originalEnd,
      downloadedBytes: 0,
      currentOffset: splitPoint + 1,
      status: 'pending',
      connectionId: this.nextSegmentId,
      speed: 0,
    };

    this.item.segments.push(newSegment);
    this.log('info', `Dynamic split: split segment ${candidate.id} at byte ${splitPoint}. Created segment ${newSegment.id} [${newSegment.startOffset} - ${newSegment.endOffset}] (${Math.round(half / 1024)} KB).`);

    this.saveState();
    // Launch worker for newly created segment
    this.downloadSegment(newSegment);
  }

  // --- Calculations & Updates ---

  private updateActiveConnectionsCount(): void {
    this.item.activeConnections = this.activeSockets.size;
  }

  private calculateGlobalSpeedAndEta(): void {
    const now = Date.now();
    const elapsed = (now - this.lastCalcTime) / 1000;

    if (elapsed >= 0.5) {
      const instSpeed = Math.round(this.bytesSinceLastCalc / elapsed);
      this.item.speed = instSpeed;
      this.bytesSinceLastCalc = 0;
      this.lastCalcTime = now;

      // Rolling average speed window (last 10 samples)
      this.speedWindow.push(instSpeed);
      if (this.speedWindow.length > 10) this.speedWindow.shift();
      const avg = Math.round(this.speedWindow.reduce((a, b) => a + b, 0) / this.speedWindow.length);
      this.item.avgSpeed = avg;

      if (instSpeed > this.item.peakSpeed) {
        this.item.peakSpeed = instSpeed;
      }

      // Progress & ETA
      if (this.item.totalBytes > 0) {
        this.item.progress = Math.min(100, Math.round((this.item.downloadedBytes / this.item.totalBytes) * 10000) / 100);
        const remainingBytes = Math.max(0, this.item.totalBytes - this.item.downloadedBytes);
        this.item.eta = avg > 0 ? Math.ceil(remainingBytes / avg) : 0;
      } else {
        this.item.progress = 0;
        this.item.eta = 0;
      }

      // Record speed history
      this.item.speedHistory.push({ timestamp: now, speed: instSpeed });
      if (this.item.speedHistory.length > 60) {
        this.item.speedHistory.shift();
      }
    }
  }

  private emitProgressThrottled(): void {
    const now = Date.now();
    if (now - this.lastProgressEmit > 200) {
      this.lastProgressEmit = now;
      this.emit('progress', this.item);
    }
  }

  private startStateFlushTimer(): void {
    this.stateFlushTimer = setInterval(() => {
      this.saveState();
    }, 2000);
  }

  private stopStateFlushTimer(): void {
    if (this.stateFlushTimer) {
      clearInterval(this.stateFlushTimer);
      this.stateFlushTimer = null;
    }
  }

  private saveState(): void {
    try {
      const state = {
        id: this.item.id,
        url: this.item.url,
        filename: this.item.filename,
        totalBytes: this.item.totalBytes,
        downloadedBytes: this.item.downloadedBytes,
        etag: this.item.serverCapabilities.etag,
        lastModified: this.item.serverCapabilities.lastModified,
        segments: this.item.segments,
        updatedAt: Date.now(),
      };
      fs.writeFileSync(this.item.stateFilePath, JSON.stringify(state, null, 2));
    } catch {
      // ignore
    }
  }

  // --- Pause / Resume / Abort ---

  public pause(): void {
    this.isPaused = true;
    this.log('info', 'Download paused by user');
    this.item.status = 'paused';
    this.item.speed = 0;
    this.item.activeConnections = 0;

    for (const [id, req] of this.activeSockets.entries()) {
      req.destroy();
    }
    this.activeSockets.clear();

    for (const timer of this.retryTimeouts.values()) {
      clearTimeout(timer);
    }
    this.retryTimeouts.clear();

    this.cleanupFd();
    this.stopStateFlushTimer();
    this.saveState();
    this.emit('progress', this.item);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.log('info', 'Download cancelled');
    this.item.status = 'cancelled';
    this.item.speed = 0;
    this.item.activeConnections = 0;

    for (const [id, req] of this.activeSockets.entries()) {
      req.destroy();
    }
    this.activeSockets.clear();

    for (const timer of this.retryTimeouts.values()) {
      clearTimeout(timer);
    }
    this.retryTimeouts.clear();

    this.cleanupFd();
    this.stopStateFlushTimer();
    this.emit('progress', this.item);
  }

  public setSpeedLimit(bytesPerSec: number): void {
    this.rateLimiter.setLimit(bytesPerSec);
    this.item.speedLimitBytesPerSec = bytesPerSec;
  }

  private finalizeCompletion(): void {
    if (this.isCompleted) return;
    this.cleanupFd();
    this.stopStateFlushTimer();

    const targetTemp = this.item.tempPath;
    if (!fs.existsSync(targetTemp)) {
      this.handleDownloadError(new Error(`Download file was not found at ${targetTemp}`));
      return;
    }

    const stat = fs.statSync(targetTemp);
    if (stat.size === 0) {
      try { fs.unlinkSync(targetTemp); } catch {}
      this.handleDownloadError(new Error('Download failed: Received 0 bytes (empty file).'));
      return;
    }

    const ext = path.extname(this.item.filename).toLowerCase();
    const isMedia = ['.mp4', '.mkv', '.webm', '.mov', '.ts', '.mp3', '.flac', '.wav', '.aac', '.m4a'].includes(ext);

    // Reject invalid small media files and error responses
    if (isMedia) {
      if (stat.size < 4096) {
        try { fs.unlinkSync(targetTemp); } catch {}
        if (fs.existsSync(this.item.stateFilePath)) {
          try { fs.unlinkSync(this.item.stateFilePath); } catch {}
        }
        this.handleDownloadError(
          new Error(`Download failed: Stream returned an invalid response (${stat.size} bytes). Never saving error responses as media.`)
        );
        return;
      }

      // Inspect payload header for HTML / text error pages
      try {
        const readLen = Math.min(1024, stat.size);
        const buf = Buffer.alloc(readLen);
        const checkFd = fs.openSync(targetTemp, 'r');
        fs.readSync(checkFd, buf, 0, readLen, 0);
        fs.closeSync(checkFd);
        const head = buf.toString('utf8').toLowerCase();
        if (
          head.includes('<!doctype') ||
          head.includes('<html') ||
          head.includes('403 forbidden') ||
          head.includes('access denied') ||
          head.includes('google error') ||
          head.includes('<error>')
        ) {
          try { fs.unlinkSync(targetTemp); } catch {}
          if (fs.existsSync(this.item.stateFilePath)) {
            try { fs.unlinkSync(this.item.stateFilePath); } catch {}
          }
          this.handleDownloadError(
            new Error(`Download failed: Server returned an error page / invalid payload (${stat.size} bytes).`)
          );
          return;
        }
      } catch {}
    }

    if (this.item.totalBytes > 0 && stat.size < this.item.totalBytes) {
      this.handleDownloadError(
        new Error(`Download incomplete: Expected ${this.item.totalBytes} bytes, but received ${stat.size} bytes.`)
      );
      return;
    }

    // Rename tempPath to finalPath
    try {
      if (fs.existsSync(this.item.finalPath)) {
        try {
          const destStat = fs.lstatSync(this.item.finalPath);
          if (destStat.isSymbolicLink() || destStat.isFile()) {
            fs.unlinkSync(this.item.finalPath);
          }
        } catch {}
      }
      fs.renameSync(targetTemp, this.item.finalPath);

      // Remove sidecar state file
      if (fs.existsSync(this.item.stateFilePath)) {
        try { fs.unlinkSync(this.item.stateFilePath); } catch {}
      }
    } catch (err: any) {
      this.log('error', `Failed to finalize file: ${err.message}`);
      this.handleDownloadError(err);
      return;
    }

    this.isCompleted = true;
    this.item.status = 'completed';
    (this.item as any).phase = 'completed';
    (this.item as any).statusMessage = 'Download verified and complete.';
    this.item.downloadedBytes = stat.size;
    if (this.item.totalBytes <= 0) {
      this.item.totalBytes = stat.size;
    }
    this.item.progress = 100;
    this.item.speed = 0;
    this.item.eta = 0;
    this.item.activeConnections = 0;
    this.item.completedAt = Date.now();
    this.item.durationMs = this.item.startedAt ? this.item.completedAt - this.item.startedAt : 0;

    this.log('info', `Download completed successfully in ${Math.round(this.item.durationMs / 1000)}s! (${stat.size} bytes)`);
    this.emit('completed', this.item);
  }

  private handleDownloadError(err: Error): void {
    this.cleanupFd();
    this.stopStateFlushTimer();

    this.item.status = 'failed';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.item.error = {
      code: (err as any).code || 'ERR_DOWNLOAD_FAILED',
      message: err.message,
      technicalDetails: err.stack,
      timestamp: Date.now(),
      retryable: true,
      retryCount: this.item.retryCount,
    };

    this.log('error', `Download failed: ${err.message}`);
    this.emit('error', err, this.item);
  }

  private cleanupFd(): void {
    if (this.fileFd !== null) {
      try {
        fs.closeSync(this.fileFd);
      } catch {
        // ignore
      }
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
