import { DownloadItem } from '../../shared/types';
import { KnowledgeEngine, ConfidenceAwareRecommendation } from './KnowledgeEngine';
import { WorkScheduler } from '../engine/WorkScheduler';
import { HttpProtocolSelector } from '../engine/HttpProtocolSelector';
import { StorageManager } from '../storage/StorageManager';

export interface AutonomousExecutionPlan {
  downloadId: string;
  url: string;
  predictedThroughputBytesPerSec: number;
  predictedThroughputFormatted: string;
  predictedDurationSeconds: number;
  predictedCompletionTimestamp: number;
  allocatedWorkers: number;
  selectedProtocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3' | 'FTP';
  segmentChunkSizeBytes: number;
  verificationPolicy: 'STRICT_FULL' | 'INCREMENTAL' | 'BASIC';
  retryBudget: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  storageCheck: { fits: boolean; freeMb: number; requiredMb: number };
  planSummary: string;
  createdAt: number;
}

export interface PlanVsActualReport {
  downloadId: string;
  predictedThroughputBytesPerSec: number;
  actualThroughputBytesPerSec: number;
  throughputDeltaPct: number;
  predictedDurationSec: number;
  actualDurationSec: number;
  durationDeltaSec: number;
  allocatedWorkers: number;
  actualPeakWorkers: number;
  varianceExplanation: string;
}

export class AutonomousDownloadPlanner {
  public static async createExecutionPlan(
    item: DownloadItem,
    knowledgeEngine: KnowledgeEngine,
    availableStorageBytes: number
  ): Promise<AutonomousExecutionPlan> {
    const domain = new URL(item.url).hostname.toLowerCase();
    const knowledge = knowledgeEngine.getRecommendation(domain);

    const protocolDecision = await HttpProtocolSelector.selectOptimalProtocol(item.url).catch(() => ({
      selectedProtocol: 'HTTP/2' as const,
      transport: 'TLS_TCP' as const,
      alpn: 'h2',
      rttMs: 35,
      reason: 'HTTP/2 TLS fallback',
      fallbackProtocol: 'HTTP/1.1' as const,
    }));

    const concurrencyRec = WorkScheduler.calculateOptimalWorkers({
      totalBytes: item.totalBytes,
      rangeSupport: item.serverCapabilities.supportsRange,
      protocol: protocolDecision.selectedProtocol,
      rttMs: protocolDecision.rttMs,
      userMaxConnections: item.maxConnections || 8,
    });

    // Estimate throughput from knowledge or baseline 10 MB/s
    const estimatedSpeed = item.serverCapabilities.supportsRange
      ? Math.max(2 * 1024 * 1024, concurrencyRec.optimalWorkers * 3 * 1024 * 1024)
      : 2 * 1024 * 1024;

    const remainingBytes = item.totalBytes > 0 ? Math.max(0, item.totalBytes - item.downloadedBytes) : 10 * 1024 * 1024;
    const predictedDurationSec = Math.ceil(remainingBytes / estimatedSpeed);
    const predictedCompletion = Date.now() + predictedDurationSec * 1000;

    const fitsInStorage = availableStorageBytes > remainingBytes;

    const formatBytes = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;

    return {
      downloadId: item.id,
      url: item.url,
      predictedThroughputBytesPerSec: estimatedSpeed,
      predictedThroughputFormatted: `${(estimatedSpeed / (1024 * 1024)).toFixed(1)} MB/s`,
      predictedDurationSeconds: predictedDurationSec,
      predictedCompletionTimestamp: predictedCompletion,
      allocatedWorkers: concurrencyRec.optimalWorkers,
      selectedProtocol: protocolDecision.selectedProtocol,
      segmentChunkSizeBytes: concurrencyRec.initialChunkSizeBytes,
      verificationPolicy: item.checksum?.expected ? 'STRICT_FULL' : 'BASIC',
      retryBudget: 5,
      confidence: knowledge.confidence,
      storageCheck: {
        fits: fitsInStorage,
        freeMb: Math.round(availableStorageBytes / (1024 * 1024)),
        requiredMb: Math.round(remainingBytes / (1024 * 1024)),
      },
      planSummary: `Autonomous Plan: ${concurrencyRec.optimalWorkers} workers over ${protocolDecision.selectedProtocol} (Est. ${predictedDurationSec}s @ ${(estimatedSpeed / (1024 * 1024)).toFixed(1)} MB/s). Storage: ${formatBytes(availableStorageBytes)} available.`,
      createdAt: Date.now(),
    };
  }

  public static comparePlanVsActual(plan: AutonomousExecutionPlan, item: DownloadItem): PlanVsActualReport {
    const actualSpeed = item.avgSpeed || item.speed || 1;
    const actualDurationSec = Math.round((item.durationMs || 1000) / 1000);

    const speedDeltaPct =
      plan.predictedThroughputBytesPerSec > 0
        ? Math.round(((actualSpeed - plan.predictedThroughputBytesPerSec) / plan.predictedThroughputBytesPerSec) * 100)
        : 0;

    const durationDeltaSec = actualDurationSec - plan.predictedDurationSeconds;

    let explanation = 'Actual execution aligned closely with predicted autonomous plan.';
    if (speedDeltaPct > 20) {
      explanation = `Actual throughput was ${speedDeltaPct}% faster than predicted due to optimal range throughput.`;
    } else if (speedDeltaPct < -20) {
      explanation = `Actual throughput was ${Math.abs(speedDeltaPct)}% slower than predicted due to server-side rate limits or network latency.`;
    }

    return {
      downloadId: item.id,
      predictedThroughputBytesPerSec: plan.predictedThroughputBytesPerSec,
      actualThroughputBytesPerSec: actualSpeed,
      throughputDeltaPct: speedDeltaPct,
      predictedDurationSec: plan.predictedDurationSeconds,
      actualDurationSec,
      durationDeltaSec,
      allocatedWorkers: plan.allocatedWorkers,
      actualPeakWorkers: item.activeConnections || plan.allocatedWorkers,
      varianceExplanation: explanation,
    };
  }
}
