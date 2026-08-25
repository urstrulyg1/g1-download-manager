import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as yauzl from 'yauzl';
import { execFile } from 'child_process';

export interface ExtractionResult {
  extracted: boolean;
  destinationDir: string;
  extractedFiles: string[];
  matchedPassword?: string;
  deletedArchive: boolean;
  engineUsed?: 'built-in-zip' | 'built-in-tar' | 'built-in-gzip' | 'system-7z' | 'system-unzip' | 'system-unrar' | 'none';
  message?: string;
}

const SUPPORTED_EXTENSIONS = ['.zip', '.rar', '.7z', '.gz', '.tgz', '.tar'];

/**
 * Real archive extraction engine.
 *
 * - .zip        → extracted natively via yauzl (streams, zip-slip safe).
 * - .tar        → extracted natively via a minimal ustar parser.
 * - .tgz/.tar.gz→ gunzipped via zlib then extracted via the tar parser.
 * - .gz         → gunzipped via zlib.
 * - encrypted .zip / .rar / .7z → delegated to system tools (7z, unzip, unrar)
 *   when available, retrying against the saved password dictionary.
 */
export class AutoExtractor {
  public static async extractArchive(
    filePath: string,
    passwords: string[] = [],
    deleteOriginalArchive = false
  ): Promise<ExtractionResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archive file not found: ${filePath}`);
    }

    const dir = path.dirname(filePath);
    const lower = filePath.toLowerCase();
    const isTarGz = lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
    const ext = isTarGz ? '.tgz' : path.extname(lower);

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return {
        extracted: false,
        destinationDir: dir,
        extractedFiles: [],
        deletedArchive: false,
        engineUsed: 'none',
        message: `Unsupported archive type: ${ext || 'unknown'}`,
      };
    }

    const baseName = isTarGz
      ? path.basename(filePath).replace(/\.(tar\.gz|tgz)$/i, '')
      : path.basename(filePath, path.extname(filePath));
    const destinationDir = path.join(dir, baseName);
    fs.mkdirSync(destinationDir, { recursive: true });

    let result: ExtractionResult;

    try {
      if (ext === '.zip') {
        result = await this.extractZip(filePath, destinationDir, passwords);
      } else if (ext === '.tar') {
        const files = this.extractTarBuffer(fs.readFileSync(filePath), destinationDir);
        result = this.ok(destinationDir, files, 'built-in-tar');
      } else if (ext === '.tgz') {
        const raw = zlib.gunzipSync(fs.readFileSync(filePath));
        const files = this.extractTarBuffer(raw, destinationDir);
        result = this.ok(destinationDir, files, 'built-in-tar');
      } else if (ext === '.gz') {
        const outPath = path.join(destinationDir, baseName);
        fs.writeFileSync(outPath, zlib.gunzipSync(fs.readFileSync(filePath)));
        result = this.ok(destinationDir, [outPath], 'built-in-gzip');
      } else {
        // .rar / .7z → system tools only
        result = await this.extractWithSystemTools(filePath, destinationDir, passwords);
      }
    } catch (err: any) {
      return {
        extracted: false,
        destinationDir,
        extractedFiles: [],
        deletedArchive: false,
        engineUsed: 'none',
        message: `Extraction failed: ${err.message}`,
      };
    }

    if (result.extracted && deleteOriginalArchive) {
      try {
        fs.unlinkSync(filePath);
        result.deletedArchive = true;
      } catch {
        result.deletedArchive = false;
      }
    }

    return result;
  }

  // ---------------------------------------------------------------- helpers

  private static ok(destinationDir: string, files: string[], engine: ExtractionResult['engineUsed']): ExtractionResult {
    return {
      extracted: true,
      destinationDir,
      extractedFiles: files,
      deletedArchive: false,
      engineUsed: engine,
    };
  }

  // Maximum uncompressed size allowed across an archive to defend against zip bombs (50GB)
  private static readonly MAX_UNCOMPRESSED_TOTAL_BYTES = 50 * 1024 * 1024 * 1024;
  private static readonly MAX_ARCHIVE_ENTRY_COUNT = 100000;

  /** Resolve an archive entry path safely inside destDir (zip-slip / path traversal / symlink guard). */
  private static safeJoin(destDir: string, entryName: string): string | null {
    if (!destDir || !entryName || entryName.includes('\0')) return null;
    const normalized = path.normalize(entryName).replace(/^([/\\])+/, '');
    if (normalized.split(/[/\\]/).includes('..')) return null;
    const target = path.join(destDir, normalized);
    const resolvedDest = path.resolve(destDir);
    if (!target.startsWith(resolvedDest + path.sep) && target !== resolvedDest) return null;

    // Canonical verification: Ensure existing ancestor directories do not escape destDir via symlinks
    try {
      if (fs.existsSync(resolvedDest)) {
        const canonicalDest = fs.realpathSync.native ? fs.realpathSync.native(resolvedDest) : fs.realpathSync(resolvedDest);
        let cur = path.dirname(target);
        while (cur && cur !== path.dirname(cur)) {
          if (fs.existsSync(cur)) {
            const realCur = fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur);
            if (realCur !== canonicalDest && !realCur.startsWith(canonicalDest + path.sep)) {
              return null;
            }
            break;
          }
          cur = path.dirname(cur);
        }
      }
    } catch {
      // ignore
    }

    return target;
  }

  // ---------------------------------------------------------------- ZIP

  private static extractZip(filePath: string, destDir: string, passwords: string[]): Promise<ExtractionResult> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return reject(err || new Error('Failed to open zip archive'));

        const extractedFiles: string[] = [];
        let sawEncrypted = false;
        let totalExtractedBytes = 0;
        let entryCount = 0;

        zipfile.on('entry', (entry: yauzl.Entry) => {
          entryCount++;
          if (entryCount > AutoExtractor.MAX_ARCHIVE_ENTRY_COUNT) {
            zipfile.close();
            return reject(new Error('Archive exceeds maximum allowed entry count (decompression bomb protection)'));
          }

          const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
          if (isEncrypted) {
            sawEncrypted = true;
            zipfile.readEntry();
            return;
          }

          if (/\/$/.test(entry.fileName)) {
            const dirTarget = this.safeJoin(destDir, entry.fileName);
            if (dirTarget) {
              try {
                if (fs.existsSync(dirTarget) && fs.lstatSync(dirTarget).isSymbolicLink()) {
                  fs.unlinkSync(dirTarget);
                }
                fs.mkdirSync(dirTarget, { recursive: true });
              } catch {}
            }
            zipfile.readEntry();
            return;
          }

          const target = this.safeJoin(destDir, entry.fileName);
          if (!target) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr || !readStream) {
              zipfile.readEntry();
              return;
            }

            try {
              if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
                fs.unlinkSync(target);
              }
              fs.mkdirSync(path.dirname(target), { recursive: true });
            } catch {}

            const writeStream = fs.createWriteStream(target);
            let entryBytes = 0;

            readStream.on('data', (chunk: Buffer) => {
              entryBytes += chunk.length;
              totalExtractedBytes += chunk.length;
              if (totalExtractedBytes > AutoExtractor.MAX_UNCOMPRESSED_TOTAL_BYTES) {
                readStream.destroy();
                writeStream.destroy();
                zipfile.close();
                reject(new Error('Archive exceeds maximum allowed uncompressed size (decompression bomb protection)'));
              }
            });

            readStream.pipe(writeStream);
            writeStream.on('close', () => {
              extractedFiles.push(target);
              zipfile.readEntry();
            });
            writeStream.on('error', () => zipfile.readEntry());
          });
        });

        zipfile.on('end', async () => {
          if (sawEncrypted) {
            // Native yauzl cannot decrypt — retry with system tools + password dictionary.
            try {
              const sysResult = await this.extractWithSystemTools(filePath, destDir, passwords);
              // Merge any plaintext entries we already extracted natively.
              sysResult.extractedFiles = Array.from(new Set([...extractedFiles, ...sysResult.extractedFiles]));
              if (!sysResult.extracted && extractedFiles.length > 0) {
                sysResult.extracted = true;
                sysResult.message = `${sysResult.message || ''} Unencrypted entries were extracted natively.`.trim();
              }
              resolve(sysResult);
            } catch (sysErr: any) {
              resolve({
                extracted: extractedFiles.length > 0,
                destinationDir: destDir,
                extractedFiles,
                deletedArchive: false,
                engineUsed: 'built-in-zip',
                message: `Archive contains encrypted entries: ${sysErr.message}`,
              });
            }
          } else {
            resolve(this.ok(destDir, extractedFiles, 'built-in-zip'));
          }
        });

        zipfile.on('error', reject);
        zipfile.readEntry();
      });
    });
  }

  // ---------------------------------------------------------------- TAR (minimal ustar parser)

  private static extractTarBuffer(buf: Buffer, destDir: string): string[] {
    const extracted: string[] = [];
    let offset = 0;
    let totalExtractedBytes = 0;
    let entryCount = 0;

    while (offset + 512 <= buf.length) {
      const header = buf.subarray(offset, offset + 512);
      // Two consecutive zero blocks = end of archive
      if (header.every((b) => b === 0)) break;

      entryCount++;
      if (entryCount > AutoExtractor.MAX_ARCHIVE_ENTRY_COUNT) break;

      let name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
      const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
      const size = parseInt(sizeOctal, 8) || 0;
      const typeFlag = String.fromCharCode(header[156]);
      const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
      if (prefix) name = `${prefix}/${name}`;

      offset += 512;
      const dataEnd = offset + size;

      if (name) {
        const target = this.safeJoin(destDir, name);
        if (target) {
          try {
            if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
              fs.unlinkSync(target);
            }
          } catch {}

          if (typeFlag === '5' || name.endsWith('/')) {
            fs.mkdirSync(target, { recursive: true });
          } else if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
            totalExtractedBytes += Math.min(size, buf.length - offset);
            if (totalExtractedBytes > AutoExtractor.MAX_UNCOMPRESSED_TOTAL_BYTES) break;

            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, buf.subarray(offset, Math.min(dataEnd, buf.length)));
            extracted.push(target);
          }
          // Symlinks/hardlinks/devices are intentionally skipped for safety.
        }
      }

      offset = dataEnd + ((512 - (size % 512)) % 512);
    }

    return extracted;
  }

  // ---------------------------------------------------------------- System tools (7z / unzip / unrar)

  private static execFileAsync(cmd: string, args: string[], timeoutMs = 120000): Promise<{ code: number }> {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 8 }, (err) => {
        resolve({ code: err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0 });
      });
    });
  }

  private static async commandExists(cmd: string): Promise<boolean> {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const { code } = await this.execFileAsync(probe, [cmd], 5000);
    return code === 0;
  }

  private static listDirRecursive(dir: string): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.listDirRecursive(full));
      else out.push(full);
    }
    return out;
  }

  private static async extractWithSystemTools(
    filePath: string,
    destDir: string,
    passwords: string[]
  ): Promise<ExtractionResult> {
    const ext = path.extname(filePath).toLowerCase();
    // Always try the empty password first (covers unencrypted rar/7z archives).
    const candidates = ['', ...passwords.filter((p) => p && p.length > 0)];

    const has7z = await this.commandExists('7z');
    const hasUnzip = ext === '.zip' && (await this.commandExists('unzip'));
    const hasUnrar = ext === '.rar' && (await this.commandExists('unrar'));

    if (!has7z && !hasUnzip && !hasUnrar) {
      return {
        extracted: false,
        destinationDir: destDir,
        extractedFiles: [],
        deletedArchive: false,
        engineUsed: 'none',
        message: `No system extractor available for ${ext} archives. Install 7-Zip (7z)${ext === '.rar' ? ' or unrar' : ''} to enable extraction.`,
      };
    }

    for (const pwd of candidates) {
      let code = 1;
      let engine: ExtractionResult['engineUsed'] = 'none';

      if (has7z) {
        engine = 'system-7z';
        code = (await this.execFileAsync('7z', ['x', '-y', `-p${pwd}`, `-o${destDir}`, filePath])).code;
      } else if (hasUnzip) {
        engine = 'system-unzip';
        code = (await this.execFileAsync('unzip', ['-o', '-P', pwd, filePath, '-d', destDir])).code;
      } else if (hasUnrar) {
        engine = 'system-unrar';
        code = (await this.execFileAsync('unrar', ['x', '-y', `-p${pwd || '-'}`, filePath, destDir])).code;
      }

      if (code === 0) {
        const files = this.listDirRecursive(destDir);
        return {
          extracted: true,
          destinationDir: destDir,
          extractedFiles: files,
          matchedPassword: pwd || undefined,
          deletedArchive: false,
          engineUsed: engine,
        };
      }
    }

    return {
      extracted: false,
      destinationDir: destDir,
      extractedFiles: [],
      deletedArchive: false,
      engineUsed: 'none',
      message: `Extraction failed — no password in the dictionary (${candidates.length - 1} tried) unlocked this archive.`,
    };
  }
}
