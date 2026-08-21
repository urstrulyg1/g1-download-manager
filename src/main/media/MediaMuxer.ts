import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

/**
 * Segment muxing.
 *
 * When ffmpeg is available, segments are concatenated with the concat demuxer
 * (proper container-aware muxing). Otherwise it falls back to raw byte
 * concatenation, which is correct for plain transport-stream segments but not
 * for containers that carry headers per file.
 */
export class MediaMuxer {
  public static async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], (err) => resolve(!err));
    });
  }

  public static async remuxSegments(
    sourceSegmentFiles: string[],
    targetFilePath: string
  ): Promise<void> {
    const existing = sourceSegmentFiles.filter((f) => fs.existsSync(f));
    if (existing.length === 0) {
      return;
    }

    if (existing.length > 1 && (await this.isFFmpegAvailable())) {
      try {
        await this.remuxWithFfmpeg(existing, targetFilePath);
        return;
      } catch {
        // Fall through to byte concatenation on ffmpeg failure.
      }
    }

    await this.concatBytes(existing, targetFilePath);
  }

  private static remuxWithFfmpeg(segments: string[], targetFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const listPath = path.join(
        os.tmpdir(),
        `g1dm_concat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`
      );
      const listContent = segments
        .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
        .join('\n');
      fs.writeFileSync(listPath, listContent, 'utf8');

      execFile(
        'ffmpeg',
        ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', targetFilePath],
        { maxBuffer: 64 * 1024 * 1024 },
        (err) => {
          fs.rmSync(listPath, { force: true });
          if (err) reject(new Error(err.message || 'ffmpeg concat failed'));
          else resolve();
        }
      );
    });
  }

  private static concatBytes(segments: string[], targetFilePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(targetFilePath, { flags: 'w' });

      let i = 0;
      const writeNext = () => {
        if (i >= segments.length) {
          output.end(() => resolve());
          return;
        }
        const segFile = segments[i++];
        const reader = fs.createReadStream(segFile);
        reader.on('error', reject);
        reader.on('end', writeNext);
        reader.pipe(output, { end: false });
      };

      output.on('error', reject);
      writeNext();
    });
  }
}
