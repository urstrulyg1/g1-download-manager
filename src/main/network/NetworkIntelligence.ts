import { EventEmitter } from 'events';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';

export interface NetworkQualityReport {
  online: boolean;
  latencyMs: number;
  lastChecked: number;
  qualityLevel: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'OFFLINE';
  consecutiveFailures: number;
}

export class NetworkIntelligence extends EventEmitter {
  private isOnline = true;
  private currentLatencyMs = 25;
  private consecutiveFailures = 0;
  private checkIntervalMs = 20000; // 20s
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(checkIntervalMs = 20000) {
    super();
    this.checkIntervalMs = checkIntervalMs;
  }

  public start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.checkConnectivity(), this.checkIntervalMs);
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    this.checkConnectivity();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getStatus(): NetworkQualityReport {
    let qualityLevel: NetworkQualityReport['qualityLevel'] = 'OFFLINE';
    if (this.isOnline) {
      if (this.currentLatencyMs < 40) qualityLevel = 'EXCELLENT';
      else if (this.currentLatencyMs < 100) qualityLevel = 'GOOD';
      else if (this.currentLatencyMs < 250) qualityLevel = 'MODERATE';
      else qualityLevel = 'POOR';
    }

    return {
      online: this.isOnline,
      latencyMs: this.currentLatencyMs,
      lastChecked: Date.now(),
      qualityLevel,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  public async checkConnectivity(): Promise<boolean> {
    if (this.isChecking) return this.isOnline;
    this.isChecking = true;

    const startTime = Date.now();
    try {
      // Perform fast DNS lookup first
      await new Promise<void>((resolve, reject) => {
        dns.lookup('one.one.one.one', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const latency = Math.max(1, Date.now() - startTime);
      this.currentLatencyMs = latency;
      this.consecutiveFailures = 0;

      if (!this.isOnline) {
        this.isOnline = true;
        this.emit('network_restored', { latencyMs: latency, timestamp: Date.now() });
        this.emit('status_change', this.getStatus());
      }
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2 && this.isOnline) {
        this.isOnline = false;
        this.emit('network_lost', { consecutiveFailures: this.consecutiveFailures, timestamp: Date.now() });
        this.emit('status_change', this.getStatus());
      }
    } finally {
      this.isChecking = false;
    }

    return this.isOnline;
  }
}
