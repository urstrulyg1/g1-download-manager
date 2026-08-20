import * as fs from 'fs';
import * as crypto from 'crypto';
import { ChecksumInfo } from '../../shared/types';

export class ChecksumVerifier {
  public static async calculateFileHash(
    filePath: string,
    algorithm: 'sha256' | 'sha512' | 'md5' = 'sha256',
    onProgress?: (bytesProcessed: number, totalBytes: number) => void
  ): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const totalBytes = stats.size;
    let bytesProcessed = 0;

    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: string | Buffer) => {
        hash.update(chunk);
        bytesProcessed += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        if (onProgress) {
          onProgress(bytesProcessed, totalBytes);
        }
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  public static async verifyChecksum(
    filePath: string,
    checksum: ChecksumInfo,
    onProgress?: (bytesProcessed: number, totalBytes: number) => void
  ): Promise<ChecksumInfo> {
    if (!checksum.expected || !checksum.expected.trim()) {
      const actual = await this.calculateFileHash(filePath, checksum.algorithm, onProgress);
      return {
        ...checksum,
        actual,
        status: 'none',
        verifiedAt: Date.now(),
      };
    }

    const actual = await this.calculateFileHash(filePath, checksum.algorithm, onProgress);
    const cleanExpected = checksum.expected.trim().toLowerCase();
    const cleanActual = actual.trim().toLowerCase();
    const isMatch = cleanExpected === cleanActual;

    return {
      ...checksum,
      actual: cleanActual,
      status: isMatch ? 'verified' : 'failed',
      verifiedAt: Date.now(),
    };
  }
}
