import * as fs from 'fs';
import * as path from 'path';
import { DownloadItem, SegmentInfo, ChecksumInfo } from '../../shared/types';
import { ChecksumVerifier } from './ChecksumVerifier';
import { SecurityScanner } from '../security/SecurityScanner';

export interface CompletionValidationResult {
  valid: boolean;
  stage: 'SIZE' | 'RANGES' | 'CONTENT' | 'CHECKSUM' | 'SECURITY' | 'ATOMIC_RENAME' | 'COMPLETE';
  error?: string;
  details: string;
}

export class CompletionVerifier {
  public static async verifyAndFinalize(
    item: DownloadItem,
    configuredAntivirusCmd?: string
  ): Promise<CompletionValidationResult> {
    const tempPath = item.tempPath;
    const finalPath = item.finalPath;

    // Stage 1: File Existence & Size Validation
    if (!fs.existsSync(tempPath)) {
      return {
        valid: false,
        stage: 'SIZE',
        error: 'Temporary download file does not exist on disk.',
        details: `Expected temp file: ${tempPath}`,
      };
    }

    const stat = fs.statSync(tempPath);
    const actualBytes = stat.size;

    if (item.totalBytes > 0 && actualBytes !== item.totalBytes) {
      return {
        valid: false,
        stage: 'SIZE',
        error: `Byte size mismatch: expected ${item.totalBytes} bytes, but disk file has ${actualBytes} bytes.`,
        details: `Expected: ${item.totalBytes}, Actual: ${actualBytes}`,
      };
    }

    // Stage 2: Range & Gap Validation (for segmented downloads)
    if (item.segments && item.segments.length > 1 && item.totalBytes > 0) {
      const sorted = [...item.segments].sort((a, b) => a.startOffset - b.startOffset);

      let currentExpected = 0;
      for (const seg of sorted) {
        if (seg.startOffset !== currentExpected) {
          return {
            valid: false,
            stage: 'RANGES',
            error: `Range gap detected: Segment ${seg.id} starts at ${seg.startOffset}, expected ${currentExpected}.`,
            details: `Gap found between byte offsets.`,
          };
        }
        currentExpected = seg.endOffset + 1;
      }

      if (currentExpected !== item.totalBytes) {
        return {
          valid: false,
          stage: 'RANGES',
          error: `Incomplete range coverage: Covered ${currentExpected} of ${item.totalBytes} bytes.`,
          details: `Missing trailing bytes.`,
        };
      }
    }

    // Stage 3: Content Validation (detect HTML error payload disguised as binary)
    if (actualBytes > 0 && actualBytes < 10000) {
      const headerBuf = Buffer.alloc(Math.min(actualBytes, 512));
      const fd = fs.openSync(tempPath, 'r');
      fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
      fs.closeSync(fd);

      const headerStr = headerBuf.toString('utf8').toLowerCase();
      const ext = path.extname(item.filename).toLowerCase();
      const isBinaryExt = ['.zip', '.exe', '.tar', '.gz', '.mp4', '.iso', '.dmg', '.pdf'].includes(ext);

      if (isBinaryExt && (headerStr.includes('<!doctype html') || headerStr.includes('<html') || headerStr.includes('403 forbidden'))) {
        return {
          valid: false,
          stage: 'CONTENT',
          error: 'Remote server returned an HTML error webpage instead of the requested binary file.',
          details: 'File header contains HTML markup or 403 Forbidden notice.',
        };
      }
    }

    // Stage 4: Checksum Verification
    if (item.checksum && item.checksum.expected && item.checksum.expected.trim()) {
      try {
        const verified = await ChecksumVerifier.verifyChecksum(tempPath, item.checksum);
        item.checksum = verified;
        if (verified.status === 'failed') {
          return {
            valid: false,
            stage: 'CHECKSUM',
            error: `Cryptographic checksum verification failed: expected "${item.checksum.expected}", computed "${verified.actual}".`,
            details: 'Checksum mismatch indicates corrupted transfer.',
          };
        }
      } catch (cErr: any) {
        return {
          valid: false,
          stage: 'CHECKSUM',
          error: `Checksum calculation failed: ${cErr.message}`,
          details: cErr.stack || '',
        };
      }
    }

    // Stage 5: Optional Security Scan
    if (configuredAntivirusCmd) {
      try {
        const scan = await SecurityScanner.scanFile(tempPath, configuredAntivirusCmd);
        item.securityScan = scan;
        if (scan.status === 'threat') {
          return {
            valid: false,
            stage: 'SECURITY',
            error: `Antivirus scanner detected potential security threat: ${scan.resultDetails}`,
            details: scan.resultDetails || 'Threat detected by local scanner.',
          };
        }
      } catch {}
    }

    // Stage 6: Atomic Rename Staging
    try {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(tempPath, finalPath);

      // Clean up .g1dm sidecar
      if (fs.existsSync(item.stateFilePath)) {
        fs.unlinkSync(item.stateFilePath);
      }
    } catch (rErr: any) {
      return {
        valid: false,
        stage: 'ATOMIC_RENAME',
        error: `Failed to atomically finalize file: ${rErr.message}`,
        details: rErr.stack || '',
      };
    }

    return {
      valid: true,
      stage: 'COMPLETE',
      details: 'All validation stages passed successfully. File finalized.',
    };
  }
}
