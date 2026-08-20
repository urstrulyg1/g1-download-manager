import { EventEmitter } from 'events';
import { DownloadItem } from '../../shared/types';

export type AutopilotActionType =
  | 'REDUCE_CONNECTIONS'
  | 'INCREASE_CONNECTIONS'
  | 'APPLY_METERED_PROFILE'
  | 'PAUSE_LOW_STORAGE'
  | 'ELEVATE_DEADLINE_PRIORITY'
  | 'SWITCH_TRANSPORT_FALLBACK'
  | 'NO_ACTION_OPTIMAL';

export interface AutopilotDecision {
  downloadId: string;
  actionType: AutopilotActionType;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  currentValue: any;
  recommendedValue: any;
  explanation: string;
  impact: string;
  autoApplied: boolean;
  timestamp: number;
}

export class DownloadAutopilot extends EventEmitter {
  public static evaluateDownload(
    item: DownloadItem,
    availableStorageBytes: number,
    isMetered = false,
    batteryPct = 100
  ): AutopilotDecision {
    const now = Date.now();

    // 1. Storage Exhaustion Check
    const remainingBytes = item.totalBytes > 0 ? Math.max(0, item.totalBytes - item.downloadedBytes) : 0;
    if (remainingBytes > 0 && availableStorageBytes < remainingBytes) {
      return {
        downloadId: item.id,
        actionType: 'PAUSE_LOW_STORAGE',
        confidence: 'HIGH',
        currentValue: `${(availableStorageBytes / 1024 / 1024).toFixed(0)} MB free`,
        recommendedValue: 'Pause safely',
        explanation: `Target volume has only ${(availableStorageBytes / 1024 / 1024).toFixed(0)} MB available, but this download requires ${(remainingBytes / 1024 / 1024).toFixed(0)} MB.`,
        impact: 'Prevents incomplete unusable file and disk-full lockup.',
        autoApplied: true,
        timestamp: now,
      };
    }

    // 2. Battery & Metered Network Protection
    if (isMetered || batteryPct < 20) {
      if (item.activeConnections > 2) {
        return {
          downloadId: item.id,
          actionType: 'APPLY_METERED_PROFILE',
          confidence: 'HIGH',
          currentValue: `${item.activeConnections} sockets`,
          recommendedValue: '2 sockets',
          explanation: isMetered
            ? 'Metered network connection detected. Throttling sockets to preserve cellular data quota.'
            : `Low battery level (${batteryPct}%). Reducing background socket activity to preserve power.`,
          impact: 'Preserves battery life and cellular data quota.',
          autoApplied: false,
          timestamp: now,
        };
      }
    }

    // 3. Unproductive Connections Evaluation
    if (item.activeConnections > 4 && item.speed > 0) {
      const avgPerSocket = item.speed / item.activeConnections;
      if (avgPerSocket < 30 * 1024) { // < 30 KB/s per connection
        const optimal = Math.max(2, Math.floor(item.activeConnections / 2));
        return {
          downloadId: item.id,
          actionType: 'REDUCE_CONNECTIONS',
          confidence: 'MEDIUM',
          currentValue: `${item.activeConnections} sockets`,
          recommendedValue: `${optimal} sockets`,
          explanation: `Only ${optimal} connections are productive. Additional sockets yield negligible speed gain on this server.`,
          impact: 'Reduces CPU overhead and prevents server 429 rate-limiting.',
          autoApplied: false,
          timestamp: now,
        };
      }
    }

    // 4. Server Rate Limiting Backoff
    if (item.retryCount >= 2 && item.error?.message.includes('429')) {
      return {
        downloadId: item.id,
        actionType: 'REDUCE_CONNECTIONS',
        confidence: 'HIGH',
        currentValue: `${item.maxConnections} sockets`,
        recommendedValue: '2 sockets',
        explanation: 'Server is actively returning HTTP 429 Too Many Requests under current concurrency.',
        impact: 'Stabilizes transfer rate and avoids IP ban.',
        autoApplied: true,
        timestamp: now,
      };
    }

    return {
      downloadId: item.id,
      actionType: 'NO_ACTION_OPTIMAL',
      confidence: 'HIGH',
      currentValue: 'Optimal',
      recommendedValue: 'Optimal',
      explanation: 'Transfer is operating within optimal performance and stability parameters.',
      impact: 'Maximum sustained throughput.',
      autoApplied: false,
      timestamp: now,
    };
  }
}
