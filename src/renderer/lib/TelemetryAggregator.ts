import { DownloadItem, SystemMetrics } from '../../shared/types';

export class TelemetryAggregator {
  private pendingUpdates: Map<string, DownloadItem> = new Map();
  private pendingMetrics: SystemMetrics | null = null;
  private animFrameId: number | null = null;
  private subscribers: Set<(updatedItems: Map<string, DownloadItem>, metrics: SystemMetrics | null) => void> = new Set();
  private lastDispatchTime = 0;
  private minDispatchIntervalMs = 30; // ~30fps-60fps smooth throttling

  public pushItemUpdate(item: DownloadItem): void {
    this.pendingUpdates.set(item.id, item);
    this.scheduleFlush();
  }

  public pushMetrics(metrics: SystemMetrics): void {
    this.pendingMetrics = metrics;
    this.scheduleFlush();
  }

  public subscribe(callback: (updatedItems: Map<string, DownloadItem>, metrics: SystemMetrics | null) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private scheduleFlush(): void {
    if (typeof window === 'undefined') return;

    const now = Date.now();
    if (now - this.lastDispatchTime >= this.minDispatchIntervalMs) {
      this.flush();
    } else if (this.animFrameId === null) {
      this.animFrameId = window.requestAnimationFrame(() => {
        this.animFrameId = null;
        this.flush();
      });
    }
  }

  private flush(): void {
    if (this.pendingUpdates.size === 0 && this.pendingMetrics === null) return;

    const updatesCopy = new Map(this.pendingUpdates);
    const metricsCopy = this.pendingMetrics;

    this.pendingUpdates.clear();
    this.pendingMetrics = null;
    this.lastDispatchTime = Date.now();

    for (const sub of this.subscribers) {
      sub(updatesCopy, metricsCopy);
    }
  }
}
