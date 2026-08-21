import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export interface TranscodeOptions {
  sourceFilePath: string;
  outputFormat: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'flac';
  startSec?: number;
  endSec?: number;
  extractAudioOnly?: boolean;
}

export interface TranscodeResult {
  success: boolean;
  outputPath: string;
  durationSec: number;
  /** True when a real ffmpeg transcode was performed; false when a fallback copy was used. */
  realTranscode: boolean;
  detail?: string;
}

/**
 * Media transcoding / trimming / remuxing.
 *
 * Uses ffmpeg when it is available on the host (real trim, container remux,
 * and audio-only extraction). When ffmpeg is missing — or fails on the input —
 * it falls back to a plain file copy so the pipeline never silently drops the
 * file, and clearly reports that no real transcode happened.
 */
export class MediaTranscoder {
  public static async transcode(options: TranscodeOptions): Promise<TranscodeResult> {
    if (!fs.existsSync(options.sourceFilePath)) {
      throw new Error(`Source file does not exist: ${options.sourceFilePath}`);
    }

    const dir = path.dirname(options.sourceFilePath);
    const ext = path.extname(options.sourceFilePath);
    const base = path.basename(options.sourceFilePath, ext);
    const outputPath = path.join(dir, `${base}_transcoded.${options.outputFormat}`);

    const start = options.startSec || 0;
    const end = options.endSec || 120;
    const duration = Math.max(1, end - start);

    if (await this.isFfmpegAvailable()) {
      try {
        await this.runFfmpeg(options, outputPath, start, end);
        return {
          success: true,
          outputPath,
          durationSec: duration,
          realTranscode: true,
        };
      } catch (err: any) {
        // Fall through to a copy fallback but surface the reason.
        return this.copyFallback(options, outputPath, duration, `ffmpeg failed: ${err.message}`);
      }
    }

    return this.copyFallback(options, outputPath, duration, 'ffmpeg not available on this system');
  }

  private static copyFallback(
    options: TranscodeOptions,
    outputPath: string,
    duration: number,
    detail: string
  ): TranscodeResult {
    fs.copyFileSync(options.sourceFilePath, outputPath);
    return {
      success: true,
      outputPath,
      durationSec: duration,
      realTranscode: false,
      detail,
    };
  }

  private static isFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], (err) => resolve(!err));
    });
  }

  private static runFfmpeg(
    options: TranscodeOptions,
    outputPath: string,
    start: number,
    end: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['-y'];

      // Trim window
      if (options.startSec !== undefined || options.endSec !== undefined) {
        args.push('-ss', String(start));
        if (options.endSec !== undefined) {
          args.push('-to', String(end));
        }
      }

      args.push('-i', options.sourceFilePath);

      if (options.extractAudioOnly) {
        args.push('-vn');
      }

      // Audio codecs for lossy audio containers.
      if (options.outputFormat === 'mp3') {
        args.push('-c:a', 'libmp3lame');
      } else if (options.outputFormat === 'flac') {
        args.push('-c:a', 'flac');
      } else if (!options.extractAudioOnly) {
        // Remux video without re-encoding (fast, lossless) when container changes.
        args.push('-c', 'copy');
      }

      args.push(outputPath);

      execFile('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 }, (err) => {
        if (err) reject(new Error(err.message || 'ffmpeg exited with an error'));
        else resolve();
      });
    });
  }
}
