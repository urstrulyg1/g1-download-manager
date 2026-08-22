import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export class BinaryLocator {
  private static cachedYtDlp: string | null = null;
  private static cachedFfmpeg: string | null = null;
  private static pathAugmented = false;

  public static ensurePath(): void {
    if (this.pathAugmented) return;

    const extraPaths = [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/opt/homebrew/opt/ffmpeg-full/bin',
      '/opt/homebrew/opt/ffmpeg/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      path.join(process.env.HOME || '', '.local/bin'),
      path.join(process.env.HOME || '', 'bin'),
    ];

    const currentPath = process.env.PATH || '';
    const currentSegments = currentPath.split(path.delimiter);
    const newSegments = [...currentSegments];

    for (const p of extraPaths) {
      if (fs.existsSync(p) && !newSegments.includes(p)) {
        newSegments.unshift(p);
      }
    }

    process.env.PATH = newSegments.join(path.delimiter);
    this.pathAugmented = true;
  }

  public static getYtDlpPath(): string {
    if (this.cachedYtDlp && fs.existsSync(this.cachedYtDlp)) {
      return this.cachedYtDlp;
    }

    this.ensurePath();

    const candidates = [
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
      path.join(process.env.HOME || '', 'bin/yt-dlp'),
    ];

    for (const bin of candidates) {
      if (fs.existsSync(bin)) {
        this.cachedYtDlp = bin;
        return bin;
      }
    }

    this.cachedYtDlp = 'yt-dlp';
    return 'yt-dlp';
  }

  public static getFfmpegPath(): string {
    if (this.cachedFfmpeg && fs.existsSync(this.cachedFfmpeg)) {
      return this.cachedFfmpeg;
    }

    this.ensurePath();

    const candidates = [
      '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
      '/opt/homebrew/opt/ffmpeg/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      path.join(process.env.HOME || '', '.local/bin/ffmpeg'),
      path.join(process.env.HOME || '', 'bin/ffmpeg'),
    ];

    for (const bin of candidates) {
      if (fs.existsSync(bin)) {
        this.cachedFfmpeg = bin;
        return bin;
      }
    }

    this.cachedFfmpeg = 'ffmpeg';
    return 'ffmpeg';
  }

  public static getFfmpegDir(): string | null {
    const ffmpegPath = this.getFfmpegPath();
    if (path.isAbsolute(ffmpegPath) && fs.existsSync(ffmpegPath)) {
      return path.dirname(ffmpegPath);
    }
    return null;
  }

  public static async isYtDlpAvailable(): Promise<boolean> {
    const bin = this.getYtDlpPath();
    return new Promise((resolve) => {
      execFile(bin, ['--version'], (err) => resolve(!err));
    });
  }

  public static async isFfmpegAvailable(): Promise<boolean> {
    const bin = this.getFfmpegPath();
    return new Promise((resolve) => {
      execFile(bin, ['-version'], (err) => resolve(!err));
    });
  }
}
