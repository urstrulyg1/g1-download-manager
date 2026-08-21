import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess, execFile } from 'child_process';
import { EventEmitter } from 'events';
import { DownloadItem, SegmentInfo } from '../../shared/types';
import { PathSanitizer } from '../storage/PathSanitizer';

export class MediaStreamDownloader extends EventEmitter {
  private item: DownloadItem;
  private childProcess: ChildProcess | null = null;
  private isPaused = false;
  private isCancelled = false;
  private isCompleted = false;
  private lastProgressEmit = 0;
  private speedWindow: number[] = [];

  constructor(item: DownloadItem) {
    super();
    this.item = item;
  }

  public static async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('yt-dlp', ['--version'], (err) => resolve(!err));
    });
  }

  public async start(): Promise<void> {
    this.isPaused = false;
    this.isCancelled = false;
    this.isCompleted = false;
    this.item.status = 'downloading';
    this.item.startedAt = this.item.startedAt || Date.now();
    (this.item as any).phase = 'preparing';
    (this.item as any).statusMessage = 'Connecting to media source...';

    this.log('info', `Starting media stream download for "${this.item.filename}" (${this.item.url})`);

    // Ensure target destination directory exists
    if (!fs.existsSync(this.item.destinationDir)) {
      fs.mkdirSync(this.item.destinationDir, { recursive: true });
    }

    try {
      await this.runDownloader();
    } catch (err: any) {
      if (this.isPaused || this.isCancelled) return;
      this.handleDownloadError(err);
    }
  }

  private async runDownloader(): Promise<void> {
    const isYtDlp = await MediaStreamDownloader.isAvailable();
    if (!isYtDlp) {
      throw new Error('Real media stream download requires yt-dlp. Please ensure yt-dlp is installed on your system.');
    }

    const outputTemplate = path.join(this.item.destinationDir, `${this.item.filename}.tmp.%(ext)s`);
    const formatSpec = (this.item as any).mediaFormatSpec || 'bestvideo+bestaudio/best';
    const targetExt = path.extname(this.item.filename).replace('.', '').toLowerCase() || 'mp4';

    const args: string[] = [
      '--no-warnings',
      '--no-playlist',
      '--newline',
      '--progress-template',
      'download:%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.status)s',
      '-f',
      formatSpec,
      '-o',
      outputTemplate,
    ];

    if (targetExt === 'mp4' || targetExt === 'mkv' || targetExt === 'webm') {
      args.push('--merge-output-format', targetExt);
    }

    // Rate limiting if specified
    if (this.item.speedLimitBytesPerSec && this.item.speedLimitBytesPerSec > 0) {
      args.push('--limit-rate', `${Math.round(this.item.speedLimitBytesPerSec / 1024)}K`);
    }

    // Proxy configuration
    if (this.item.proxy && this.item.proxy.enabled && this.item.proxy.host) {
      const proxyUrl = `${this.item.proxy.type}://${this.item.proxy.auth && this.item.proxy.username ? `${this.item.proxy.username}:${this.item.proxy.password}@` : ''}${this.item.proxy.host}:${this.item.proxy.port}`;
      args.push('--proxy', proxyUrl);
    }

    // Authentication custom headers or cookies
    if (this.item.auth?.cookies) {
      // Save temporary cookie file if needed or pass headers
      args.push('--add-header', `Cookie:${this.item.auth.cookies}`);
    }

    args.push(this.item.url);

    (this.item as any).phase = 'connecting';
    this.emitProgressThrottled(true);

    await new Promise<void>((resolve, reject) => {
      this.childProcess = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';

      this.childProcess.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuffer += text;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          this.parseOutputLine(line.trim());
        }
      });

      this.childProcess.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';

        for (const line of lines) {
          const l = line.trim();
          if (l) {
            this.log('warn', l);
          }
        }
      });

      this.childProcess.on('error', (err) => {
        reject(err);
      });

      this.childProcess.on('close', async (code) => {
        this.childProcess = null;
        if (this.isPaused || this.isCancelled) {
          resolve();
          return;
        }

        if (code !== 0) {
          reject(new Error(stderrBuffer.trim() || `Media downloader exited with code ${code}`));
          return;
        }

        try {
          await this.finalizeDownloadedMedia();
          resolve();
        } catch (err: any) {
          reject(err);
        }
      });
    });
  }

  public validateFileIntegrity(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Media file was not found at ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size <= 100) {
      throw new Error(`Media validation failed: Payload too small (${stat.size} bytes). Output is an invalid or error response.`);
    }
  }

  public parseOutputLine(line: string): void {
    if (!line) return;

    if (line.startsWith('download:')) {
      (this.item as any).phase = 'downloading';
      const parts = line.replace('download:', '').split('|');
      if (parts.length >= 6) {
        const pctStr = parts[0].trim().replace('%', '');
        const dlBytesStr = parts[1].trim();
        const totalBytesStr = parts[2].trim();
        const speedStr = parts[3].trim();
        const etaStr = parts[4].trim();

        const pct = parseFloat(pctStr);
        if (!isNaN(pct)) {
          this.item.progress = Math.min(Math.max(pct, 0), 99.9);
        }

        const dlBytes = this.parseByteString(dlBytesStr);
        if (dlBytes > 0) {
          this.item.downloadedBytes = dlBytes;
        }

        const totalBytes = this.parseByteString(totalBytesStr);
        if (totalBytes > 0) {
          this.item.totalBytes = totalBytes;
        }

        const speed = this.parseByteString(speedStr);
        if (speed > 0) {
          this.item.speed = speed;
          this.speedWindow.push(speed);
          if (this.speedWindow.length > 10) this.speedWindow.shift();
          this.item.avgSpeed = Math.round(this.speedWindow.reduce((a, b) => a + b, 0) / this.speedWindow.length);
          if (speed > (this.item.peakSpeed || 0)) {
            this.item.peakSpeed = speed;
          }
        }

        const eta = this.parseEtaString(etaStr);
        if (eta >= 0) {
          this.item.eta = eta;
        }

        this.item.activeConnections = 8;
        this.emitProgressThrottled();
      }
      return;
    }

    if (line.includes('[Merger]') || line.includes('Merging formats') || line.includes('[ffmpeg] Merging')) {
      (this.item as any).phase = 'merging';
      (this.item as any).statusMessage = 'Muxing separate audio & video streams (FFmpeg)...';
      this.item.speed = 0;
      this.log('info', 'Multiplexing audio and video streams with FFmpeg');
      this.emitProgressThrottled(true);
      return;
    }

    if (line.includes('[download] Destination:') || line.includes('[ExtractAudio]')) {
      this.log('info', line);
    }
  }

  private async finalizeDownloadedMedia(): Promise<void> {
    if (this.isCompleted) return;

    (this.item as any).phase = 'verifying';
    (this.item as any).statusMessage = 'Verifying container integrity & playability...';
    this.emitProgressThrottled(true);

    // Look for matching output files in destination directory
    const basePrefix = `${this.item.filename}.tmp.`;
    const files = fs.readdirSync(this.item.destinationDir);
    const matchedFiles = files.filter((f) => f.startsWith(basePrefix) && !f.endsWith('.part') && !f.endsWith('.ytdl'));

    let candidatePath = '';
    if (matchedFiles.length > 0) {
      candidatePath = path.join(this.item.destinationDir, matchedFiles[0]);
    } else {
      // Check if target file or finalPath exists
      if (fs.existsSync(this.item.finalPath)) {
        candidatePath = this.item.finalPath;
      } else {
        // Find any file created recently matching filename base
        const sanitizedBase = path.basename(this.item.filename, path.extname(this.item.filename));
        const matchedLoose = files.find((f) => f.includes(sanitizedBase) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (matchedLoose) {
          candidatePath = path.join(this.item.destinationDir, matchedLoose);
        }
      }
    }

    if (!candidatePath || !fs.existsSync(candidatePath)) {
      throw new Error(`Media file was not created at destination: ${this.item.finalPath}`);
    }

    // 1. Verify file size
    const stat = fs.statSync(candidatePath);
    if (stat.size <= 100) {
      // Clean up failed file
      try { fs.unlinkSync(candidatePath); } catch {}
      throw new Error(`Media validation failed: Output size is only ${stat.size} bytes (invalid/error payload).`);
    }

    // 2. Atomic move to target finalPath
    const candidateExt = path.extname(candidatePath);
    const finalExt = path.extname(this.item.finalPath) || candidateExt;
    const finalPathWithExt = this.item.finalPath.endsWith(finalExt)
      ? this.item.finalPath
      : `${path.join(this.item.destinationDir, path.basename(this.item.filename, path.extname(this.item.filename)))}${candidateExt}`;

    if (candidatePath !== finalPathWithExt) {
      if (fs.existsSync(finalPathWithExt)) {
        try { fs.unlinkSync(finalPathWithExt); } catch {}
      }
      fs.renameSync(candidatePath, finalPathWithExt);
    }

    this.item.finalPath = finalPathWithExt;
    this.item.filename = path.basename(finalPathWithExt);
    this.item.downloadedBytes = stat.size;
    this.item.totalBytes = stat.size;
    this.item.status = 'completed';
    (this.item as any).phase = 'completed';
    (this.item as any).statusMessage = 'Download and verification complete.';
    this.item.progress = 100;
    this.item.speed = 0;
    this.item.eta = 0;
    this.item.activeConnections = 0;
    this.item.completedAt = Date.now();
    this.item.durationMs = this.item.startedAt ? this.item.completedAt - this.item.startedAt : 0;

    // Clean up temporary sidecar files
    if (fs.existsSync(this.item.tempPath)) {
      try { fs.unlinkSync(this.item.tempPath); } catch {}
    }
    if (fs.existsSync(this.item.stateFilePath)) {
      try { fs.unlinkSync(this.item.stateFilePath); } catch {}
    }

    this.isCompleted = true;
    this.log('info', `Media download finalized and verified! Real size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
    this.emit('completed', this.item);
  }

  private parseByteString(str: string): number {
    if (!str) return 0;
    const clean = str.trim().toLowerCase();
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;

    if (clean.includes('gib') || clean.includes('gb') || clean.includes('g/s') || clean.includes('gib/s')) {
      return Math.round(num * 1024 * 1024 * 1024);
    }
    if (clean.includes('mib') || clean.includes('mb') || clean.includes('m/s') || clean.includes('mib/s')) {
      return Math.round(num * 1024 * 1024);
    }
    if (clean.includes('kib') || clean.includes('kb') || clean.includes('k/s') || clean.includes('kib/s')) {
      return Math.round(num * 1024);
    }
    if (clean.includes('b')) {
      return Math.round(num);
    }
    return Math.round(num);
  }

  private parseEtaString(str: string): number {
    if (!str || str === '0' || str.includes('unknown')) return 0;
    const parts = str.trim().split(':').map((n) => parseInt(n, 10));
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  public pause(): void {
    this.isPaused = true;
    this.log('info', 'Media download paused by user');
    this.item.status = 'paused';
    (this.item as any).phase = 'paused';
    this.item.speed = 0;
    this.item.activeConnections = 0;

    if (this.childProcess) {
      try {
        this.childProcess.kill('SIGTERM');
      } catch {}
      this.childProcess = null;
    }

    this.emit('progress', this.item);
  }

  public cancel(): void {
    this.isCancelled = true;
    this.log('info', 'Media download cancelled by user');
    this.item.status = 'cancelled';
    (this.item as any).phase = 'cancelled';
    this.item.speed = 0;
    this.item.activeConnections = 0;

    if (this.childProcess) {
      try {
        this.childProcess.kill('SIGKILL');
      } catch {}
      this.childProcess = null;
    }

    // Clean up partial temporary files on cancellation
    try {
      const files = fs.readdirSync(this.item.destinationDir);
      const prefix = `${this.item.filename}.tmp.`;
      for (const f of files) {
        if (f.startsWith(prefix) || f.startsWith(this.item.filename)) {
          if (f.endsWith('.part') || f.endsWith('.ytdl') || f.includes('.tmp.')) {
            try { fs.unlinkSync(path.join(this.item.destinationDir, f)); } catch {}
          }
        }
      }
    } catch {}

    this.emit('progress', this.item);
  }

  private handleDownloadError(err: Error): void {
    this.item.status = 'failed';
    (this.item as any).phase = 'failed';
    this.item.speed = 0;
    this.item.activeConnections = 0;
    this.item.error = {
      code: 'ERR_MEDIA_DOWNLOAD_FAILED',
      message: err.message,
      technicalDetails: err.stack,
      timestamp: Date.now(),
      retryable: true,
      retryCount: this.item.retryCount,
    };

    this.log('error', `Media download failed: ${err.message}`);
    this.emit('error', err, this.item);
  }

  private emitProgressThrottled(force = false): void {
    const now = Date.now();
    if (force || now - this.lastProgressEmit >= 250) {
      this.lastProgressEmit = now;
      this.emit('progress', this.item);
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const logEntry = { timestamp: Date.now(), level, message };
    this.item.logs.push(logEntry);
    if (this.item.logs.length > 200) this.item.logs.shift();
    this.emit('log', level, message);
  }
}
