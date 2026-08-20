import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { ArchiveInfo, ArchiveEntry } from '../../shared/types';

export class ArchiveInspector {
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
          // Check for path traversal (zip slip)
          if (entry.fileName.includes('..') || path.isAbsolute(entry.fileName)) {
            hasDangerous = true;
          }

          const isDir = /\/$/.test(entry.fileName);
          const isEncrypted = Boolean((entry.generalPurposeBitFlag & 0x1) !== 0);

          entries.push({
            name: entry.fileName,
            size: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            modifiedDate: entry.getLastModDate ? entry.getLastModDate().toISOString() : new Date().toISOString(),
            isDirectory: isDir,
            isEncrypted,
          });

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
