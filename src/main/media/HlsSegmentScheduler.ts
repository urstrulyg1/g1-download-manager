import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';
import { HlsMediaSegment } from './MediaManifestParser';
import { TokenBucketRateLimiter } from '../engine/RateLimiter';

export interface HlsSegmentDownloadProgress {
  completedSegments: number;
  totalSegments: number;
  downloadedBytes: number;
  currentSpeed: number;
}

export class HlsSegmentScheduler extends EventEmitter {
  private segments: HlsMediaSegment[];
  private rateLimiter: TokenBucketRateLimiter;
  private concurrency: number;
  private isPaused = false;
  private isCancelled = false;

  constructor(
    segments: HlsMediaSegment[],
    rateLimiter?: TokenBucketRateLimiter,
    concurrency: number = 4
  ) {
    super();
    this.segments = segments;
    this.rateLimiter = rateLimiter || new TokenBucketRateLimiter(0);
    this.concurrency = Math.min(concurrency, 16);
  }

  public async downloadAll(
    onSegmentData: (segmentIndex: number, buffer: Buffer) => Promise<void>
  ): Promise<{ totalBytes: number }> {
    let completed = 0;
    let totalBytes = 0;
    const total = this.segments.length;

    // Process in batches
    for (let i = 0; i < this.segments.length; i += this.concurrency) {
      if (this.isPaused || this.isCancelled) break;

      const batch = this.segments.slice(i, i + this.concurrency);
      const results = await Promise.all(
        batch.map(async (seg) => {
          const buf = await this.fetchSegmentWithRetry(seg.url, seg.byteRange, 3);
          await onSegmentData(seg.index, buf);
          completed++;
          totalBytes += buf.length;

          this.emit('progress', {
            completedSegments: completed,
            totalSegments: total,
            downloadedBytes: totalBytes,
            currentSpeed: 0,
          } as HlsSegmentDownloadProgress);

          return buf.length;
        })
      );
    }

    return { totalBytes };
  }

  public pause(): void {
    this.isPaused = true;
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  private async fetchSegmentWithRetry(
    url: string,
    byteRange?: { length: number; offset: number },
    retries = 3
  ): Promise<Buffer> {
    let lastError: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.fetchSegmentBuffer(url, byteRange);
      } catch (err: any) {
        lastError = err;
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    throw new Error(`Failed downloading segment after ${retries} attempts: ${lastError?.message}`);
  }

  private async fetchSegmentBuffer(
    targetUrl: string,
    byteRange?: { length: number; offset: number }
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) G1DM/1.0',
        'Accept': '*/*',
      };

      if (byteRange) {
        headers['Range'] = `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`;
      }

      const req = reqMod.get(targetUrl, { headers, timeout: 15000 }, (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
          res.headers.location
        ) {
          const redirect = new URL(res.headers.location, targetUrl).href;
          this.fetchSegmentBuffer(redirect, byteRange).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
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
}
