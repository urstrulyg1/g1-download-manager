import * as fs from 'fs';
import { SegmentInfo } from '../../shared/types';

export interface ForensicsReport {
  filePath: string;
  totalExpectedBytes: number;
  actualDiskBytes: number;
  healthyBytesRecovered: number;
  missingBytes: number;
  uncompletedSegments: number[];
  canSelectivelyResume: boolean;
  forensicRecommendation: string;
}

export class ForensicsEngine {
  public static analyzePartialFile(
    tempFilePath: string,
    totalExpectedBytes: number,
    segments: SegmentInfo[] = []
  ): ForensicsReport {
    if (!fs.existsSync(tempFilePath)) {
      return {
        filePath: tempFilePath,
        totalExpectedBytes,
        actualDiskBytes: 0,
        healthyBytesRecovered: 0,
        missingBytes: totalExpectedBytes,
        uncompletedSegments: segments.map((s) => s.id),
        canSelectivelyResume: false,
        forensicRecommendation: 'Temporary file missing. Fresh start required.',
      };
    }

    const stat = fs.statSync(tempFilePath);
    const diskBytes = stat.size;

    const completedSegs = segments.filter((s) => s.status === 'completed');
    const uncompletedSegs = segments.filter((s) => s.status !== 'completed').map((s) => s.id);

    const healthyBytes = completedSegs.reduce((sum, s) => sum + s.downloadedBytes, 0);
    const missingBytes = Math.max(0, totalExpectedBytes - healthyBytes);

    return {
      filePath: tempFilePath,
      totalExpectedBytes,
      actualDiskBytes: diskBytes,
      healthyBytesRecovered: healthyBytes,
      missingBytes,
      uncompletedSegments: uncompletedSegs,
      canSelectivelyResume: completedSegs.length > 0,
      forensicRecommendation:
        completedSegs.length > 0
          ? `Preserve ${completedSegs.length} verified completed segments and selectively re-download only ${uncompletedSegs.length} remaining segments.`
          : 'Resume from current disk byte offset.',
    };
  }
}
