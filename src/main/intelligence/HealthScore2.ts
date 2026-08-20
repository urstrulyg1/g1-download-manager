import { DownloadItem } from '../../shared/types';

export interface PredictedFailure {
  type: 'STORAGE_EXHAUSTION' | 'NETWORK_INSTABILITY' | 'SERVER_THROTTLING' | 'SESSION_EXPIRATION' | 'NONE';
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedTimeUntilFailureSeconds?: number;
  warning: string;
  preventionAction: string;
}

export interface DetailedHealthScore2 {
  downloadId: string;
  overallScore: number;
  networkScore: number;
  serverScore: number;
  resumeSafetyScore: number;
  storageSafetyScore: number;
  integrityConfidenceScore: number;
  connectionEfficiencyScore: number;
  overallExplanation: string;
  predictedFailures: PredictedFailure[];
}

export class HealthScore2 {
  public static calculate(item: DownloadItem, availableStorageBytes: number): DetailedHealthScore2 {
    let networkScore = 95;
    let serverScore = 90;
    let resumeSafetyScore = item.serverCapabilities.supportsRange ? 100 : 20;
    let storageSafetyScore = 100;
    let integrityConfidenceScore = item.checksum?.status === 'verified' ? 100 : 90;
    let connectionEfficiencyScore = 92;

    const predictedFailures: PredictedFailure[] = [];

    // 1. Storage Prediction
    const remainingBytes = item.totalBytes > 0 ? Math.max(0, item.totalBytes - item.downloadedBytes) : 0;
    if (remainingBytes > 0 && availableStorageBytes < remainingBytes) {
      storageSafetyScore = 10;
      const speed = item.speed > 0 ? item.speed : 1024 * 1024;
      const timeUntilExhaust = Math.round(availableStorageBytes / speed);

      predictedFailures.push({
        type: 'STORAGE_EXHAUSTION',
        probability: 'HIGH',
        estimatedTimeUntilFailureSeconds: timeUntilExhaust,
        warning: `Disk will run out of storage space in approximately ${Math.round(timeUntilExhaust / 60)} minutes.`,
        preventionAction: 'Free up disk space on target partition or pause this download.',
      });
    } else if (remainingBytes > 0 && availableStorageBytes < remainingBytes * 1.3) {
      storageSafetyScore = 65;
      predictedFailures.push({
        type: 'STORAGE_EXHAUSTION',
        probability: 'LOW',
        warning: 'Tight storage space headroom.',
        preventionAction: 'Monitor free storage on destination drive.',
      });
    }

    // 2. Server Throttling Prediction
    if (item.retryCount >= 2) {
      serverScore = Math.max(30, 90 - item.retryCount * 20);
      predictedFailures.push({
        type: 'SERVER_THROTTLING',
        probability: 'HIGH',
        warning: 'High rate of server errors and retries detected.',
        preventionAction: 'G1DM Autopilot will automatically reduce concurrent sockets.',
      });
    }

    // 3. Network Prediction
    if (item.activeConnections > 0 && item.speed === 0) {
      networkScore = 40;
      predictedFailures.push({
        type: 'NETWORK_INSTABILITY',
        probability: 'MEDIUM',
        warning: 'Transfer throughput dropped to 0 KB/s with open sockets.',
        preventionAction: 'Stall auto-recovery active.',
      });
    }

    // Weighted Overall Score
    const overallScore = Math.round(
      networkScore * 0.25 +
      serverScore * 0.25 +
      resumeSafetyScore * 0.2 +
      storageSafetyScore * 0.15 +
      integrityConfidenceScore * 0.15
    );

    let overallExplanation = 'Download is operating at peak health and stability.';
    if (storageSafetyScore < 50) {
      overallExplanation = `Health is ${overallScore}/100 due to critically low available disk storage space.`;
    } else if (serverScore < 60) {
      overallExplanation = `Health is ${overallScore}/100 because the remote server is throttling concurrent requests.`;
    } else if (networkScore < 60) {
      overallExplanation = `Health is ${overallScore}/100 due to network latency or connection resets.`;
    }

    return {
      downloadId: item.id,
      overallScore,
      networkScore,
      serverScore,
      resumeSafetyScore,
      storageSafetyScore,
      integrityConfidenceScore,
      connectionEfficiencyScore,
      overallExplanation,
      predictedFailures,
    };
  }
}
