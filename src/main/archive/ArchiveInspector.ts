import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { ArchiveInfo, ArchiveEntry, ArchiveType } from '../../shared/types';

export class ArchiveInspector {
  /** Map a file name to its recognized archive type (or null). */
  public static detectArchiveType(filePath: string): ArchiveType | null {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tbz')) return 'bz2';
    if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'xz';
    if (lower.endsWith('.tar.zst')) return 'zst';
    if (lower.endsWith('.tar')) return 'tar';
    if (lower.endsWith('.zip')) return 'zip';
    if (lower.endsWith('.jar')) return 'jar';
    if (lower.endsWith('.apk')) return 'apk';
    if (lower.endsWith('.gz')) return 'gz';
    if (lower.endsWith('.bz2')) return 'bz2';
    if (lower.endsWith('.xz')) return 'xz';
    if (lower.endsWith('.zst')) return 'zst';
    if (lower.endsWith('.7z')) return '7z';
    if (lower.endsWith('.rar')) return 'rar';
    if (lower.endsWith('.iso')) return 'iso';
    return null;
  }

  public static async inspect(filePath: string): Promise<ArchiveInfo> {
    if (!fs.existsSync(filePath)) {
      return {
        isArchive: false,
        entryCount: 0,
        totalUncompressedSize: 0,
        files: [],
      };
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.zip' || ext === '.jar' || ext === '.apk') {
      return this.inspectZip(filePath);
    }

    // Non-ZIP archive formats: we can recognise the type even though full
    // entry enumeration is only implemented for ZIP archives.
    const detectedType = this.detectArchiveType(filePath);
    if (detectedType) {
      return {
        isArchive: true,
        archiveType: detectedType,
        entryCount: 0,
        totalUncompressedSize: 0,
        files: [],
      };
    }

    return {
      isArchive: false,
      entryCount: 0,
      totalUncompressedSize: 0,
      files: [],
    };
  }

  private static async inspectZip(filePath: string): Promise<ArchiveInfo> {
    return new Promise((resolve) => {
      yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err || !zipfile) {
          resolve({
            isArchive: true,
            archiveType: 'zip',
            entryCount: 0,
            totalUncompressedSize: 0,
            files: [],
          });
          return;
        }

        const entries: ArchiveEntry[] = [];
        let totalUncompressed = 0;
        let hasDangerous = false;

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          // Check for path traversal (zip slip, absolute paths, Windows drives, UNC shares, null bytes)
          const rawName = entry.fileName || '';
          const normalized = path.normalize(rawName).replace(/^([/\\])+/, '');
          if (
            rawName.includes('\0') ||
            normalized.split(/[/\\]/).includes('..') ||
            path.isAbsolute(rawName) ||
            /^[a-zA-Z]:[/\\]/.test(rawName) ||
            rawName.startsWith('\\\\')
          ) {
            hasDangerous = true;
          }

          const isDir = /\/$/.test(entry.fileName);
          const isEncrypted = Boolean((entry.generalPurposeBitFlag & 0x1) !== 0);

          if (entries.length < 5000) {
            entries.push({
              name: entry.fileName,
              size: entry.uncompressedSize,
              compressedSize: entry.compressedSize,
              modifiedDate: entry.getLastModDate ? entry.getLastModDate().toISOString() : new Date().toISOString(),
              isDirectory: isDir,
              isEncrypted,
            });
          }

          totalUncompressed += entry.uncompressedSize;
          zipfile.readEntry();
        });

        zipfile.on('end', () => {
          resolve({
            isArchive: true,
            archiveType: 'zip',
            entryCount: zipfile.entryCount,
            totalUncompressedSize: totalUncompressed,
            files: entries,
            hasDangerousPath: hasDangerous,
          });
        });

        zipfile.on('error', () => {
          resolve({
            isArchive: true,
            archiveType: 'zip',
            entryCount: entries.length,
            totalUncompressedSize: totalUncompressed,
            files: entries,
            hasDangerousPath: hasDangerous,
          });
        });
      });
    });
  }
}
