import * as fs from 'fs';
import * as path from 'path';
import { MaintenanceScanResult } from '../../shared/types';
import { AppDatabase } from '../db/Database';
import { PathGuard } from '../security/PathGuard';

export class StorageManager {
  public static getStorageStats(targetPath: string): { totalBytes: number; freeBytes: number; usedBytes: number } {
    try {
      const stats = fs.statfsSync(targetPath);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      return { totalBytes, freeBytes, usedBytes };
    } catch {
      // Fallback estimate if statfs fails
      return {
        totalBytes: 100 * 1024 * 1024 * 1024,
        freeBytes: 50 * 1024 * 1024 * 1024,
        usedBytes: 50 * 1024 * 1024 * 1024,
      };
    }
  }

  public static checkSpaceAvailable(targetDir: string, requiredBytes: number): boolean {
    if (requiredBytes <= 0) return true;
    const stats = this.getStorageStats(targetDir);
    // Keep 100MB buffer
    return stats.freeBytes - requiredBytes > 100 * 1024 * 1024;
  }

  public static async scanMaintenance(db: AppDatabase, customDirs?: string[]): Promise<MaintenanceScanResult> {
    const downloads = db.getAllDownloads();
    const knownTempPaths = new Set(downloads.map((d) => path.resolve(d.tempPath)));
    const knownStatePaths = new Set(downloads.map((d) => path.resolve(d.stateFilePath)));
    const knownFinalPaths = new Set(downloads.map((d) => path.resolve(d.finalPath)));

    const settings = db.getSettings();
    const dirsToScan = new Set<string>();
    dirsToScan.add(path.resolve(settings.general.defaultDownloadDir));
    downloads.forEach((d) => dirsToScan.add(path.resolve(d.destinationDir)));
    if (customDirs) {
      customDirs.forEach((d) => dirsToScan.add(path.resolve(d)));
    }

    const orphanedFiles: { path: string; size: number; modifiedAt: number }[] = [];
    let totalRecoverable = 0;

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.resolve(dir, file);
          if (file.endsWith('.part') || file.endsWith('.g1dm')) {
            if (!knownTempPaths.has(fullPath) && !knownStatePaths.has(fullPath)) {
              const stat = fs.statSync(fullPath);
              orphanedFiles.push({
                path: fullPath,
                size: stat.size,
                modifiedAt: stat.mtimeMs,
              });
              totalRecoverable += stat.size;
            }
          }
        }
      } catch {
        // ignore dir read error
      }
    }

    // Missing destination files for completed downloads
    const missingDestinationFiles: { id: string; path: string; filename: string }[] = [];
    for (const item of downloads) {
      if (item.status === 'completed' && !fs.existsSync(item.finalPath)) {
        missingDestinationFiles.push({
          id: item.id,
          path: item.finalPath,
          filename: item.filename,
        });
      }
    }

    // Broken records
    const brokenRecords: { id: string; filename: string; reason: string }[] = [];
    for (const item of downloads) {
      if (item.status === 'failed' && item.error) {
        brokenRecords.push({
          id: item.id,
          filename: item.filename,
          reason: item.error.message,
        });
      }
    }

    return {
      orphanedPartialFiles: orphanedFiles,
      brokenRecords,
      missingDestinationFiles,
      totalRecoverableBytes: totalRecoverable,
    };
  }

  public static cleanOrphanedFiles(filePaths: string[]): { cleaned: number; freedBytes: number } {
    let cleaned = 0;
    let freedBytes = 0;

    for (const p of filePaths) {
      if (!p || typeof p !== 'string') continue;
      try {
        const safePath = PathGuard.assertSafeLocalPath(p);
        const lower = safePath.toLowerCase();
        // Guardrail: only allow cleaning temporary or partial download files (.part, .g1dm, .tmp)
        const isAllowedExt =
          lower.endsWith('.part') ||
          lower.endsWith('.g1dm') ||
          lower.endsWith('.tmp') ||
          lower.includes('.part.');

        if (!isAllowedExt) {
          continue;
        }

        if (fs.existsSync(safePath)) {
          const stat = fs.statSync(safePath);
          if (!stat.isDirectory()) {
            fs.unlinkSync(safePath);
            cleaned++;
            freedBytes += stat.size;
          }
        }
      } catch {
        // ignore invalid/unauthorized paths
      }
    }

    return { cleaned, freedBytes };
  }
}
