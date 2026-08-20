import * as os from 'os';
import { EventEmitter } from 'events';

export interface NetworkTransitionEvent {
  type: 'INTERFACE_CHANGED' | 'DISCONNECTED' | 'RECONNECTED' | 'SYSTEM_SLEEP_WAKE';
  previousIp?: string;
  currentIp?: string;
  timestamp: number;
}

export class NetworkTransitionDetector extends EventEmitter {
  private lastIp: string = '';
  private lastTick: number = Date.now();
  private interval: NodeJS.Timeout | null = null;

  public start(): void {
    this.lastIp = this.getActiveIp();
    this.lastTick = Date.now();

    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.tick();
    }, 2000);
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastTick;

    // Detect sleep/wake: If clock skipped ahead by > 6 seconds on a 2s interval
    if (elapsed > 6000) {
      this.emit('transition', {
        type: 'SYSTEM_SLEEP_WAKE',
        timestamp: now,
      } as NetworkTransitionEvent);
    }
    this.lastTick = now;

    const currentIp = this.getActiveIp();
    if (currentIp !== this.lastIp) {
      const prev = this.lastIp;
      this.lastIp = currentIp;

      if (!currentIp) {
        this.emit('transition', {
          type: 'DISCONNECTED',
          previousIp: prev,
          timestamp: now,
        } as NetworkTransitionEvent);
      } else if (!prev) {
        this.emit('transition', {
          type: 'RECONNECTED',
          currentIp,
          timestamp: now,
        } as NetworkTransitionEvent);
      } else {
        this.emit('transition', {
          type: 'INTERFACE_CHANGED',
          previousIp: prev,
          currentIp,
          timestamp: now,
        } as NetworkTransitionEvent);
      }
    }
  }

  public getActiveIp(): string {
    const ifaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const a of addrs) {
        if (!a.internal && a.family === 'IPv4') {
          return a.address;
        }
      }
    }
    return '';
  }
}
