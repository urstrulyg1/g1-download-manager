import { DownloadItem } from '../../shared/types';
import { StorageManager } from '../storage/StorageManager';

export interface DownloadHealthReport {
  downloadId: string;
  healthScore: number; // 0 - 100
  serverReliabilityScore: number; // 0 - 100
  resumeReliability: 'High' | 'Moderate' | 'Unsafe';
  connectionEfficiencyPct: number;
  storageRisk: 'None' | 'Low' | 'Critical';
  networkRisk: 'None' | 'High Latency' | 'Unstable';
  recommendations: string[];
}

export type DuplicateClassification =
  | 'DEFINITELY_DUPLICATE'
  | 'PROBABLY_DUPLICATE'
  | 'POTENTIAL_DUPLICATE'
  | 'DIFFERENT_RESOURCE';

export interface DuplicateDetectionResult {
  classification: DuplicateClassification;
  matchedDownloadId?: string;
  matchedFilename?: string;
  reason: string;
}

export class DownloadIntelligence {
  public static calculateHealth(item: DownloadItem, availableStorageBytes: number): DownloadHealthReport {
    let score = 50;
    const recommendations: string[] = [];

    // 1. Range & Server Capabilities
    if (item.serverCapabilities.supportsRange) {
      score += 25;
      recommendations.push('Server supports range requests and dynamic segmentation.');
    } else {
      score -= 15;
      recommendations.push('Single-stream fallback active (server does not support Range header).');
    }

    // 2. TLS Security
    if (item.url.startsWith('https:')) {
      score += 10;
    } else {
      score -= 5;
      recommendations.push('Unencrypted plain HTTP transfer.');
    }

    // 3. Error & Retry penalty
    if (item.retryCount > 0) {
      score -= Math.min(25, item.retryCount * 5);
      recommendations.push(`Download has retried ${item.retryCount} time(s).`);
    }

    // 4. Storage Risk
    let storageRisk: 'None' | 'Low' | 'Critical' = 'None';
    const needed = item.totalBytes > 0 ? item.totalBytes - item.downloadedBytes : 100 * 1024 * 1024;
    if (availableStorageBytes < needed) {
      storageRisk = 'Critical';
      score -= 30;
      recommendations.push('Insufficient storage capacity available to complete this download!');
    } else if (availableStorageBytes < needed * 1.5) {
      storageRisk = 'Low';
      score -= 10;
      recommendations.push('Low disk space headroom.');
    }

    // 5. Resume Reliability
    let resumeReliability: 'High' | 'Moderate' | 'Unsafe' = 'Moderate';
    if (item.serverCapabilities.supportsRange && (item.serverCapabilities.etag || item.serverCapabilities.lastModified)) {
      resumeReliability = 'High';
      score += 15;
    } else if (!item.serverCapabilities.supportsRange) {
      resumeReliability = 'Unsafe';
      score -= 10;
    }

    const healthScore = Math.max(0, Math.min(100, score));
    const serverReliability = item.retryCount === 0 ? 95 : Math.max(20, 95 - item.retryCount * 15);
    const connectionEfficiency = item.activeConnections > 0 ? Math.min(98, 80 + item.activeConnections * 2) : 90;

    return {
      downloadId: item.id,
      healthScore,
      serverReliabilityScore: serverReliability,
      resumeReliability,
      connectionEfficiencyPct: connectionEfficiency,
      storageRisk,
      networkRisk: item.retryCount > 2 ? 'Unstable' : 'None',
      recommendations,
    };
  }

  public static detectDuplicate(
    candidate: { url: string; filename?: string; size?: number; etag?: string; sha256?: string },
    existingDownloads: DownloadItem[]
  ): DuplicateDetectionResult {
    const normalizeUrl = (u: string) => u.split('#')[0].replace(/\/$/, '').toLowerCase();
    const candidateNormUrl = normalizeUrl(candidate.url);

    for (const existing of existingDownloads) {
      const existingNormUrl = normalizeUrl(existing.url);

      // 1. Same SHA256 or (Same ETag + Same Size + Same URL)
      if (candidate.sha256 && existing.checksum.actual && candidate.sha256.toLowerCase() === existing.checksum.actual.toLowerCase()) {
        return {
          classification: 'DEFINITELY_DUPLICATE',
          matchedDownloadId: existing.id,
          matchedFilename: existing.filename,
          reason: 'Identical cryptographic SHA-256 checksum match.',
        };
      }

      if (
        candidateNormUrl === existingNormUrl &&
        candidate.etag &&
        existing.serverCapabilities.etag &&
        candidate.etag === existing.serverCapabilities.etag
      ) {
        return {
          classification: 'DEFINITELY_DUPLICATE',
          matchedDownloadId: existing.id,
          matchedFilename: existing.filename,
          reason: 'Identical URL and Server ETag match.',
        };
      }

      // 2. Same Normalized URL
      if (candidateNormUrl === existingNormUrl) {
        return {
          classification: 'PROBABLY_DUPLICATE',
          matchedDownloadId: existing.id,
          matchedFilename: existing.filename,
          reason: 'Identical normalized URL is already present in download manager.',
        };
      }

      // 3. Same filename + Same file size
      if (
        candidate.filename &&
        existing.filename.toLowerCase() === candidate.filename.toLowerCase() &&
        candidate.size &&
        candidate.size > 0 &&
        existing.totalBytes === candidate.size
      ) {
        return {
          classification: 'POTENTIAL_DUPLICATE',
          matchedDownloadId: existing.id,
          matchedFilename: existing.filename,
          reason: `Matching filename and byte size (${candidate.size} bytes).`,
        };
      }
    }

    return {
      classification: 'DIFFERENT_RESOURCE',
      reason: 'No matching duplicate detected.',
    };
  }
}
