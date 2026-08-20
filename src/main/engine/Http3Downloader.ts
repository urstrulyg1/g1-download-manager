import { EventEmitter } from 'events';
import { DownloadItem } from '../../shared/types';
import { TokenBucketRateLimiter } from './RateLimiter';
import { Http2Downloader } from './Http2Downloader';
import { HttpDownloader } from './HttpDownloader';
import { QuicDiagnostics } from './QuicDiagnostics';

export class Http3Downloader extends EventEmitter {
  private item: DownloadItem;
  private rateLimiter: TokenBucketRateLimiter;
  private underlyingWorker: Http2Downloader | HttpDownloader | null = null;
  private isPaused = false;
  private isCancelled = false;

  constructor(item: DownloadItem, rateLimiter?: TokenBucketRateLimiter) {
    super();
    this.item = item;
    this.rateLimiter = rateLimiter || new TokenBucketRateLimiter(item.speedLimitBytesPerSec);
  }

  public async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;

    // Check HTTP/3 capability
    const quic = await QuicDiagnostics.probeHttp3(this.item.url, 4000);
    this.log('info', `Protocol Negotiation: ${quic.protocol} (${quic.details})`);

    // In current Node.js environment, forward to optimized HTTP/2 multiplexed streams
    this.underlyingWorker = new Http2Downloader(this.item, this.rateLimiter);

    this.underlyingWorker.on('progress', (updated) => this.emit('progress', updated));
    this.underlyingWorker.on('completed', (comp) => this.emit('completed', comp));
    this.underlyingWorker.on('error', (err, failed) => this.emit('error', err, failed));
    this.underlyingWorker.on('log', (level, msg) => this.emit('log', level, msg));

    await this.underlyingWorker.start();
  }

  public pause(): void {
    this.isPaused = true;
    if (this.underlyingWorker) {
      this.underlyingWorker.pause();
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    if (this.underlyingWorker) {
      this.underlyingWorker.cancel();
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.item.logs.push({ timestamp: Date.now(), level, message });
    this.emit('log', level, message);
  }
}
