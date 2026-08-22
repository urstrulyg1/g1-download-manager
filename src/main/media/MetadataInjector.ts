import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { BinaryLocator } from '../platform/BinaryLocator';

export interface ChapterMetadata {
  startTimeSec: number;
  title: string;
}

export interface MediaMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverArtUrl?: string;
  chapters?: ChapterMetadata[];
}

/**
 * Embeds ID3 / MP4 metadata into media files via ffmpeg.
 *
 * Returns `false` (instead of fabricating success) when ffmpeg is unavailable
 * or fails on the input. Chapter metadata is written to a temporary ffmetadata
 * file and applied with the ffmetadata demuxer.
 */
export class MetadataInjector {
  public static async injectMetadata(filePath: string, metadata: MediaMetadata): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const available = await BinaryLocator.isFfmpegAvailable();

    if (!available) {
      return false;
    }

    try {
      await this.runFfmpeg(filePath, metadata);
      return true;
    } catch {
      return false;
    }
  }

  private static runFfmpeg(filePath: string, metadata: MediaMetadata): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmpDir = os.tmpdir();
      const metadataFile = path.join(
        tmpDir,
        `g1dm_meta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`
      );

      let metaContent = ';FFMETADATA1\n';
      if (metadata.title) metaContent += `title=${this.escape(metadata.title)}\n`;
      if (metadata.artist) metaContent += `artist=${this.escape(metadata.artist)}\n`;
      if (metadata.album) metaContent += `album=${this.escape(metadata.album)}\n`;
      for (const ch of metadata.chapters || []) {
        metaContent += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(ch.startTimeSec * 1000)}\nEND=${Math.round(ch.startTimeSec * 1000) + 1000}\ntitle=${this.escape(ch.title)}\n`;
      }
      fs.writeFileSync(metadataFile, metaContent, 'utf8');

      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const outputPath = path.join(dir, `${base}_tagged${ext}`);

      const args = ['-y', '-i', metadataFile, '-i', filePath, '-map_metadata', '1', '-c', 'copy', outputPath];

      const ffmpegBin = BinaryLocator.getFfmpegPath();
      execFile(ffmpegBin, args, { maxBuffer: 64 * 1024 * 1024, env: { ...process.env } }, (err) => {
        fs.rmSync(metadataFile, { force: true });
        if (err) {
          reject(new Error(err.message || 'ffmpeg metadata injection failed'));
          return;
        }
        // Replace the original with the tagged file.
        fs.rmSync(filePath, { force: true });
        fs.renameSync(outputPath, filePath);
        resolve();
      });
    });
  }

  private static escape(value: string): string {
    // ffmetadata: newlines and '=' in values must be avoided.
    return value.replace(/[=\n\r]/g, ' ').trim();
  }
}
