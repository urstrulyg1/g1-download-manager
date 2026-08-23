import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export class BinaryLocator {
  private static cachedYtDlp: string | null = null;
  private static cachedFfmpeg: string | null = null;
  private static pathAugmented = false;

  public static ensurePath(): void {
    if (this.pathAugmented) return;

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const extraPaths = [
      // macOS paths
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/opt/homebrew/opt/ffmpeg-full/bin',
      '/opt/homebrew/opt/ffmpeg/bin',
      '/usr/local/bin',
      // Linux & Unix paths
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      '/snap/bin',
      '/var/lib/flatpak/exports/bin',
      path.join(home, '.local/bin'),
      path.join(home, 'bin'),
      // Windows paths
      path.join(localAppData, 'Programs', 'yt-dlp'),
      path.join(localAppData, 'Programs', 'ffmpeg', 'bin'),
      path.join(home, 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin',
      path.join(programFiles, 'yt-dlp'),
      path.join(programFiles, 'ffmpeg', 'bin'),
      'C:\\ffmpeg\\bin',
    ];

    const currentPath = process.env.PATH || '';
    const currentSegments = currentPath.split(path.delimiter);
    const newSegments = [...currentSegments];

    for (const p of extraPaths) {
      if (p && fs.existsSync(p) && !newSegments.includes(p)) {
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
    const isWin = process.platform === 'win32';
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

    const candidates = [
      // macOS candidates
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      // Linux candidates
      '/usr/bin/yt-dlp',
      '/snap/bin/yt-dlp',
      path.join(home, '.local/bin/yt-dlp'),
      path.join(home, 'bin/yt-dlp'),
      // Windows candidates
      path.join(localAppData, 'Programs', 'yt-dlp', 'yt-dlp.exe'),
      path.join(home, 'scoop', 'shims', 'yt-dlp.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe',
      path.join(programFiles, 'yt-dlp', 'yt-dlp.exe'),
      'C:\\yt-dlp\\yt-dlp.exe',
      isWin ? 'yt-dlp.exe' : 'yt-dlp',
    ];

    for (const bin of candidates) {
      if (fs.existsSync(bin)) {
        this.cachedYtDlp = bin;
        return bin;
      }
    }

    this.cachedYtDlp = isWin ? 'yt-dlp.exe' : 'yt-dlp';
    return this.cachedYtDlp;
  }

  public static getFfmpegPath(): string {
    if (this.cachedFfmpeg && fs.existsSync(this.cachedFfmpeg)) {
      return this.cachedFfmpeg;
    }

    this.ensurePath();
    const isWin = process.platform === 'win32';
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

    const candidates = [
      // macOS candidates
      '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
      '/opt/homebrew/opt/ffmpeg/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      // Linux candidates
      '/usr/bin/ffmpeg',
      '/snap/bin/ffmpeg',
      path.join(home, '.local/bin/ffmpeg'),
      path.join(home, 'bin/ffmpeg'),
      // Windows candidates
      path.join(localAppData, 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      path.join(home, 'scoop', 'shims', 'ffmpeg.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      isWin ? 'ffmpeg.exe' : 'ffmpeg',
    ];

    for (const bin of candidates) {
      if (fs.existsSync(bin)) {
        this.cachedFfmpeg = bin;
        return bin;
      }
    }

    this.cachedFfmpeg = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    return this.cachedFfmpeg;
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
