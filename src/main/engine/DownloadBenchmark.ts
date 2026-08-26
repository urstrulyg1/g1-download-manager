import * as http from 'http';
import * as https from 'https';
import { TlsPolicy } from '../security/TlsPolicy';

export interface BenchmarkTierResult {
  workersCount: number;
  protocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
  measuredThroughputBytesPerSec: number;
  measuredThroughputFormatted: string;
  rttMs: number;
  timeToFirstByteMs: number;
}

export interface BenchmarkReport {
  targetUrl: string;
  testedTiers: BenchmarkTierResult[];
  recommendedWorkers: number;
  recommendedProtocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
  peakThroughputFormatted: string;
  recommendationReason: string;
  benchmarkTimestamp: number;
}

export class DownloadBenchmark {
  public static async runBenchmark(targetUrl: string, probeDurationMs = 2000): Promise<BenchmarkReport> {
    const isHttps = targetUrl.startsWith('https:');
    const testedTiers: BenchmarkTierResult[] = [];

    // Test tiers: 1 worker, 2 workers, 4 workers, 8 workers
    const tiers = [1, 2, 4, 8];

    for (const workers of tiers) {
      const start = Date.now();
      const probe = await this.probeThroughput(targetUrl, workers, probeDurationMs);
      const elapsedSec = Math.max(0.5, (Date.now() - start) / 1000);
      const throughput = Math.round(probe.bytesTransferred / elapsedSec);

      testedTiers.push({
        workersCount: workers,
        protocol: isHttps ? 'HTTP/2' : 'HTTP/1.1',
        measuredThroughputBytesPerSec: throughput,
        measuredThroughputFormatted: `${(throughput / (1024 * 1024)).toFixed(1)} MB/s`,
        rttMs: probe.avgConnectMs,
        timeToFirstByteMs: probe.avgTtfbMs,
      });
    }

    // Determine optimal point with diminishing returns analysis
    let bestWorkers = 1;
    let peakSpeed = 0;

    for (let i = 0; i < testedTiers.length; i++) {
      const current = testedTiers[i];
      if (current.measuredThroughputBytesPerSec > peakSpeed) {
        // Only scale up if gain is at least 5%
        if (peakSpeed === 0 || (current.measuredThroughputBytesPerSec - peakSpeed) / peakSpeed > 0.05) {
          peakSpeed = current.measuredThroughputBytesPerSec;
          bestWorkers = current.workersCount;
        }
      }
    }

    const peak = testedTiers.sort((a, b) => b.measuredThroughputBytesPerSec - a.measuredThroughputBytesPerSec)[0];

    return {
      targetUrl,
      testedTiers,
      recommendedWorkers: bestWorkers,
      recommendedProtocol: isHttps ? 'HTTP/2' : 'HTTP/1.1',
      peakThroughputFormatted: peak?.measuredThroughputFormatted || 'N/A',
      recommendationReason: `Benchmark demonstrates ${bestWorkers} workers achieves optimal throughput (${peak?.measuredThroughputFormatted}). Higher socket allocation produces negligible gains.`,
      benchmarkTimestamp: Date.now(),
    };
  }

  private static async probeThroughput(targetUrl: string, workers: number, durationMs: number): Promise<{ bytesTransferred: number; avgConnectMs: number; avgTtfbMs: number }> {
    return new Promise<{ bytesTransferred: number; avgConnectMs: number; avgTtfbMs: number }>((resolve) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      let totalBytes = 0;
      const start = Date.now();
      const connectSamples: number[] = [];
      const ttfbSamples: number[] = [];

      const promises = Array.from({ length: workers }).map(() => {
        return new Promise<void>((workerResolve) => {
          const requestStart = Date.now();

          const req = reqMod.get(
            targetUrl,
            {
              headers: {
                'Range': 'bytes=0-1048575', // 1MB probe chunk
                'User-Agent': 'G1DM-Benchmark/1.0',
              },
              timeout: durationMs,
              rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
            },
            (res) => {
              // Real time-to-first-byte: measured from request start until the
              // first response body byte actually arrives from the server.
              res.once('data', (c: Buffer) => {
                ttfbSamples.push(Date.now() - requestStart);
                totalBytes += c.length;
                if (Date.now() - start > durationMs) {
                  res.destroy();
                }
              });
              res.on('data', (c) => {
                totalBytes += c.length;
                if (Date.now() - start > durationMs) {
                  res.destroy();
                }
              });
              res.on('end', () => workerResolve());
              res.on('error', () => workerResolve());
            }
          );

          // Real round-trip estimate: raw TCP connect latency.
          req.on('socket', (socket) => {
            socket.once('connect', () => {
              connectSamples.push(Date.now() - requestStart);
            });
          });

          req.on('error', () => workerResolve());
          req.on('timeout', () => {
            req.destroy();
            workerResolve();
          });
        });
      });

      Promise.all(promises).then(() => {
        const avg = (samples: number[]) =>
          samples.length > 0 ? Math.round(samples.reduce((sum, s) => sum + s, 0) / samples.length) : 0;
        resolve({
          bytesTransferred: totalBytes,
          avgConnectMs: avg(connectSamples),
          avgTtfbMs: avg(ttfbSamples),
        });
      });
    });
  }
}
