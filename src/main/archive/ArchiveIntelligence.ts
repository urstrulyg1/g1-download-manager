import * as fs from 'fs';
import * as path from 'path';
import { ArchiveInspector } from './ArchiveInspector';

export interface ArchiveIntelligenceReport {
  filePath: string;
  isArchive: boolean;
  archiveType: string;
  totalEntries: number;
  uncompressedSizeBytes: number;
  compressionRatio: number;
  largestFiles: { name: string; size: number }[];
  securityAudit: {
    hasZipSlip: boolean;
    hasAbsolutePaths: boolean;
    hasSuspiciousExecutables: boolean;
    isSafeToExtract: boolean;
  };
}

export class ArchiveIntelligence {
  public static async analyzeArchive(filePath: string): Promise<ArchiveIntelligenceReport> {
    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        isArchive: false,
        archiveType: 'Unknown',
        totalEntries: 0,
        uncompressedSizeBytes: 0,
        compressionRatio: 1.0,
        largestFiles: [],
        securityAudit: {
          hasZipSlip: false,
          hasAbsolutePaths: false,
          hasSuspiciousExecutables: false,
          isSafeToExtract: true,
        },
      };
    }

    const info = await ArchiveInspector.inspect(filePath);
    const diskStat = fs.statSync(filePath);
    const compressedSize = Math.max(1, diskStat.size);
    const ratio = Math.round((info.totalUncompressedSize / compressedSize) * 10) / 10;

    let hasZipSlip = false;
    let hasAbsolute = false;
    let hasSuspiciousExe = false;

    const files = info.files || [];
    for (const f of files) {
      if (f.name.includes('..') || f.name.includes('/../') || f.name.includes('\\..\\')) {
        hasZipSlip = true;
      }
      if (path.isAbsolute(f.name)) {
        hasAbsolute = true;
      }
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.exe') || lower.endsWith('.scr') || lower.endsWith('.vbs') || lower.endsWith('.bat')) {
        hasSuspiciousExe = true;
      }
    }

    const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map((f) => ({ name: f.name, size: f.size }));

    return {
      filePath,
      isArchive: info.isArchive,
      archiveType: info.archiveType || 'zip',
      totalEntries: info.entryCount,
      uncompressedSizeBytes: info.totalUncompressedSize,
      compressionRatio: ratio > 0 ? ratio : 1.0,
      largestFiles: largest,
      securityAudit: {
        hasZipSlip,
        hasAbsolutePaths: hasAbsolute,
        hasSuspiciousExecutables: hasSuspiciousExe,
        isSafeToExtract: !hasZipSlip && !hasAbsolute,
      },
    };
  }
}
