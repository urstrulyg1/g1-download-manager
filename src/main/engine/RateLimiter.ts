export class TokenBucketRateLimiter {
  private limitBytesPerSec: number;
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;

  constructor(limitBytesPerSec: number = 0) {
    this.limitBytesPerSec = limitBytesPerSec;
    this.tokens = limitBytesPerSec > 0 ? limitBytesPerSec : Infinity;
    this.maxTokens = limitBytesPerSec > 0 ? limitBytesPerSec * 2 : Infinity;
    this.lastRefill = Date.now();
  }

  public setLimit(bytesPerSec: number): void {
    this.limitBytesPerSec = bytesPerSec;
    this.maxTokens = bytesPerSec > 0 ? bytesPerSec * 2 : Infinity;
    if (bytesPerSec <= 0) {
      this.tokens = Infinity;
    } else if (this.tokens > this.maxTokens) {
      this.tokens = this.maxTokens;
    }
  }

  public getLimit(): number {
    return this.limitBytesPerSec;
  }

  private refill(): void {
    if (this.limitBytesPerSec <= 0) {
      this.tokens = Infinity;
      return;
    }
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSec * this.limitBytesPerSec);
      this.lastRefill = now;
    }
  }

  public async acquire(bytes: number): Promise<void> {
    if (this.limitBytesPerSec <= 0) return;

    this.refill();
    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return;
    }

    const needed = bytes - this.tokens;
    const waitMs = Math.ceil((needed / this.limitBytesPerSec) * 1000);
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 1000)));
    this.refill();
    this.tokens = Math.max(0, this.tokens - bytes);
  }
}
