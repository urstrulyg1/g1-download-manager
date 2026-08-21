import * as http from 'http';
import * as https from 'https';

export interface MirrorHostNode {
  url: string;
  hostname: string;
  isAlive: boolean;
  rttMs: number;
  activeWorkers: number;
  totalBytesDownloaded: number;
  currentSpeedBps: number;
  failureCount: number;
  lastCheckedAt: number;
  isPrimary: boolean;
}

export interface SwarmAssignment {
  workerId: number;
  mirrorUrl: string;
  segmentIndex: number;
  startByte: number;
  endByte: number;
}

export class MultiMirrorSwarmEngine {
  private mirrors: Map<string, MirrorHostNode> = new Map();
  private primaryUrl: string;

  constructor(primaryUrl: string, initialMirrors: string[] = []) {
    this.primaryUrl = primaryUrl;
    this.addMirror(primaryUrl, true);
    for (const m of initialMirrors) {
      this.addMirror(m, false);
    }
  }

  public addMirror(url: string, isPrimary: boolean = false): void {
    if (!url || this.mirrors.has(url)) return;
    try {
      const parsed = new URL(url);
      this.mirrors.set(url, {
        url,
        hostname: parsed.hostname,
        isAlive: true,
        rttMs: 100,
        activeWorkers: 0,
        totalBytesDownloaded: 0,
        currentSpeedBps: 0,
        failureCount: 0,
        lastCheckedAt: Date.now(),
        isPrimary,
      });
    } catch {
      // Invalid URL ignored
    }
  }

  public removeMirror(url: string): boolean {
    if (url === this.primaryUrl) return false; // cannot remove primary
    return this.mirrors.delete(url);
  }

  public getMirrors(): MirrorHostNode[] {
    return Array.from(this.mirrors.values()).sort((a, b) => {
      if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
      return a.rttMs - b.rttMs;
    });
  }

  public async probeAllMirrors(timeoutMs: number = 4000): Promise<MirrorHostNode[]> {
    const probePromises = Array.from(this.mirrors.values()).map(async (mirror) => {
      const start = Date.now();
      try {
        const parsed = new URL(mirror.url);
        const protocol = parsed.protocol === 'https:' ? https : http;

        await new Promise<void>((resolve, reject) => {
          const req = protocol.request(
            mirror.url,
            { method: 'HEAD', timeout: timeoutMs, headers: { 'User-Agent': 'G1DM/1.0 Swarm Engine' } },
            (res) => {
              mirror.rttMs = Date.now() - start;
              mirror.isAlive = res.statusCode ? res.statusCode < 500 : true;
              mirror.lastCheckedAt = Date.now();
              resolve();
            }
          );
          req.on('error', (err) => {
            mirror.failureCount++;
            if (mirror.failureCount >= 3) mirror.isAlive = false;
            resolve();
          });
          req.on('timeout', () => {
            req.destroy();
            mirror.failureCount++;
            if (mirror.failureCount >= 3) mirror.isAlive = false;
            resolve();
          });
          req.end();
        });
      } catch {
        mirror.isAlive = false;
      }
      return mirror;
    });

    await Promise.all(probePromises);
    return this.getMirrors();
  }

  /**
   * Selects the optimal mirror for a new worker segment request.
   * Balances lowest RTT and least loaded workers.
   */
  public selectBestMirror(): string {
    const alive = Array.from(this.mirrors.values()).filter((m) => m.isAlive);
    if (alive.length === 0) return this.primaryUrl;

    // Sort by combined score: activeWorkers * 100 + rttMs
    alive.sort((a, b) => {
      const scoreA = a.activeWorkers * 150 + a.rttMs;
      const scoreB = b.activeWorkers * 150 + b.rttMs;
      return scoreA - scoreB;
    });

    const chosen = alive[0];
    chosen.activeWorkers++;
    return chosen.url;
  }

  public releaseWorker(mirrorUrl: string, bytesDownloaded: number = 0, speedBps: number = 0): void {
    const mirror = this.mirrors.get(mirrorUrl);
    if (mirror) {
      mirror.activeWorkers = Math.max(0, mirror.activeWorkers - 1);
      mirror.totalBytesDownloaded += bytesDownloaded;
      if (speedBps > 0) mirror.currentSpeedBps = speedBps;
    }
  }

  public recordFailure(mirrorUrl: string): void {
    const mirror = this.mirrors.get(mirrorUrl);
    if (mirror) {
      mirror.failureCount++;
      if (mirror.failureCount >= 3) {
        mirror.isAlive = false;
      }
    }
  }
}
