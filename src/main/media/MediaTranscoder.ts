import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { BinaryLocator } from '../platform/BinaryLocator';

export interface TranscodeOptions {
  sourceFilePath: string;
  outputFormat: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'aac' | 'flac' | 'wav';
  outputDir?: string;
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
 * Real media transcoding and format conversion.
 *
 * Uses ffmpeg when it is available on the host (real trim, container remux,
 * and audio-only extraction). When ffmpeg is missing — or fails on the input —
 * it transparently falls back to a direct file copy so the pipeline never
 * fails unrecoverably, while clearly reporting `realTranscode: false`.
 */
export class MediaTranscoder {
  public static async transcode(options: TranscodeOptions): Promise<TranscodeResult> {
    if (!fs.existsSync(options.sourceFilePath)) {
      throw new Error(`Source file does not exist: ${options.sourceFilePath}`);
    }

    const dir = options.outputDir || path.dirname(options.sourceFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const baseName = path.basename(
      options.sourceFilePath,
      path.extname(options.sourceFilePath)
    );
    const outputPath = path.join(dir, `${baseName}_transcoded.${options.outputFormat}`);

    const start = options.startSec ?? 0;
    const end = options.endSec ?? 0;
    const duration = end > start ? end - start : 0;

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
        // Fall back to direct copy if ffmpeg fails on this particular input.
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
    if (options.sourceFilePath !== outputPath) {
      fs.copyFileSync(options.sourceFilePath, outputPath);
    }
    return {
      success: true,
      outputPath,
      durationSec: duration,
      realTranscode: false,
      detail,
    };
  }

  private static isFfmpegAvailable(): Promise<boolean> {
    return BinaryLocator.isFfmpegAvailable();
  }

  private static runFfmpeg(
    options: TranscodeOptions,
    outputPath: string,
    start: number,
    end: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegBin = BinaryLocator.getFfmpegPath();
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

      execFile(ffmpegBin, args, { maxBuffer: 64 * 1024 * 1024, env: { ...process.env } }, (err) => {
        if (err) reject(new Error(err.message || 'ffmpeg exited with an error'));
        else resolve();
      });
    });
  }
}
