import { DownloadEngine } from '../engine/DownloadEngine';

export class LatencySense {
  private static thresholdMs = 80;
  private static enabled = true;
  private static lastPingMs = 25;
  private static isThrottled = false;

  public static updatePing(currentPingMs: number, engine?: DownloadEngine): boolean {
    this.lastPingMs = currentPingMs;
    if (!this.enabled) return false;

    if (currentPingMs > this.thresholdMs && !this.isThrottled) {
      this.isThrottled = true;
      if (engine) {
        engine.setGlobalSpeedLimit(1024 * 512); // Throttle background to 512 KB/s
      }
      return true;
    } else if (currentPingMs <= this.thresholdMs && this.isThrottled) {
      this.isThrottled = false;
      if (engine) {
        engine.setGlobalSpeedLimit(0); // Restore full line speed
      }
      return false;
    }
    return this.isThrottled;
  }

  public static setThreshold(ms: number) {
    this.thresholdMs = ms;
  }

  public static setEnabled(state: boolean) {
    this.enabled = state;
  }

  public static getStatus() {
    return {
      enabled: this.enabled,
      thresholdMs: this.thresholdMs,
      lastPingMs: this.lastPingMs,
      isThrottled: this.isThrottled,
    };
  }
}
