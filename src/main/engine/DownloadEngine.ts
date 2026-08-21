import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  DownloadItem,
  DownloadStatus,
  Priority,
  DownloadAuth,
  ProxyConfig,
  AppSettings,
  DownloadQueue,
} from '../../shared/types';
import { AppDatabase } from '../db/Database';
import { DownloadStateMachine, DownloadLifecycleState } from './StateMachine';
import { ServerPolicyEngine } from './ServerPolicyEngine';
import { DynamicSegmentScheduler } from './DynamicSegmentScheduler';
import { HttpDownloader } from './HttpDownloader';
import { Http2Downloader } from './Http2Downloader';
import { FtpDownloader } from './FtpDownloader';
import { HlsDownloader } from './HlsDownloader';
import { ProbeService } from './ProbeService';
import { TokenBucketRateLimiter } from './RateLimiter';
import { ChecksumVerifier } from './ChecksumVerifier';
import { RecoveryJournal } from '../db/RecoveryJournal';
import { SecretStore } from '../security/SecretStore';
import { PathSanitizer } from '../storage/PathSanitizer';
import { DownloadIntelligence } from './DownloadIntelligence';
import { MaliciousLinkScanner } from '../security/MaliciousLinkScanner';

export class DownloadEngine extends EventEmitter {
  private db: AppDatabase;
  private downloads: Map<string, DownloadItem> = new Map();
  private stateMachines: Map<string, DownloadStateMachine> = new Map();
  private activeWorkers: Map<string, HttpDownloader | Http2Downloader | FtpDownloader | HlsDownloader> = new Map();
  private policyEngine: ServerPolicyEngine = new ServerPolicyEngine();
  private globalRateLimiter: TokenBucketRateLimiter;
  private isShuttingDown = false;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(db: AppDatabase) {
    super();
    this.db = db;
    const settings = db.getSettings();
    this.globalRateLimiter = new TokenBucketRateLimiter(settings.downloads.globalSpeedLimitBytesPerSec || 0);
  }

  public async init(): Promise<void> {
    const persisted = this.db.getAllDownloads();
    for (const item of persisted) {
      this.downloads.set(item.id, item);
      const initialLifecycle: DownloadLifecycleState =
        item.status === 'downloading' ? 'RECOVERING' : (item.status.toUpperCase() as DownloadLifecycleState);
      const sm = new DownloadStateMachine(item.id, initialLifecycle);
      this.stateMachines.set(item.id, sm);
    }

    await this.recoverState();
    this.startEngineLoop();
  }

  private async recoverState(): Promise<void> {
    for (const item of this.downloads.values()) {
      const sm = this.stateMachines.get(item.id);
      if (item.status === 'downloading' || sm?.getState() === 'RECOVERING') {
        item.status = 'paused';
        item.speed = 0;
        item.activeConnections = 0;
        if (sm?.canTransitionTo('PAUSED')) {
          sm.transitionTo('PAUSED', 'Recovered from abnormal shutdown');
        }

        if (fs.existsSync(item.stateFilePath)) {
          try {
            const raw = fs.readFileSync(item.stateFilePath, 'utf8');
            const state = JSON.parse(raw);
            if (state.segments && Array.isArray(state.segments)) {
              item.segments = state.segments;
              item.downloadedBytes = state.downloadedBytes || item.downloadedBytes;
            }
          } catch {}
        }

        if (fs.existsSync(item.tempPath)) {
          const stat = fs.statSync(item.tempPath);
          if (item.totalBytes <= 0 && stat.size > 0) {
            item.downloadedBytes = stat.size;
          }
        }

        item.logs.push({
          timestamp: Date.now(),
          level: 'warn',
          message: 'Recovered from previous unexpected shutdown. Resuming safely.',
        });

        RecoveryJournal.logEvent(this.db, item.id, 'DOWNLOAD_PAUSED', { reason: 'Crash recovery' });
        this.db.saveDownload(item);
      }
    }
  }

  private startEngineLoop(): void {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    this.schedulerInterval = setInterval(() => {
      this.processQueues();
    }, 1000);
  }

  private processQueues(): void {
    if (this.isShuttingDown) return;

    const settings = this.db.getSettings();
    const globalMaxActive = settings.downloads.maxConcurrentDownloads || 4;

    const activeCount = Array.from(this.downloads.values()).filter((d) => d.status === 'downloading').length;
    if (activeCount >= globalMaxActive) return;

    const queues = this.db.getQueues().filter((q) => q.status === 'active');
    let slotsLeft = globalMaxActive - activeCount;

    for (const queue of queues) {
      if (slotsLeft <= 0) break;

      const queueActiveCount = Array.from(this.downloads.values()).filter(
        (d) => d.queueId === queue.id && d.status === 'downloading'
      ).length;

      const queueMax = queue.maxConcurrentDownloads || 4;
      if (queueActiveCount >= queueMax) continue;

      const queueSlots = Math.min(slotsLeft, queueMax - queueActiveCount);

      const queuedItems = Array.from(this.downloads.values())
        .filter((d) => d.queueId === queue.id && d.status === 'queued')
        .sort((a, b) => {
          const priorityWeight: Record<Priority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
          const pDiff = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
          if (pDiff !== 0) return pDiff;
          return a.createdAt - b.createdAt;
        });

      for (let i = 0; i < Math.min(queueSlots, queuedItems.length); i++) {
        const item = queuedItems[i];
        slotsLeft--;
        this.startDownload(item.id).catch((err) => {
          console.error(`Failed to start queued download ${item.id}:`, err);
        });
      }
    }
  }

  // --- Add Download with Smart Duplication Check & Server Intelligence ---

  public async addDownload(params: {
    url: string;
    filename?: string;
    destinationDir?: string;
    category?: string;
    queueId?: string;
    priority?: Priority;
    maxConnections?: number;
    speedLimitBytesPerSec?: number;
    auth?: DownloadAuth;
    proxy?: ProxyConfig;
    checksum?: { algorithm: 'sha256' | 'sha512' | 'md5'; expected?: string };
    startImmediately?: boolean;
  }): Promise<DownloadItem> {
    const settings = this.db.getSettings();

    // Check duplicate
    const dupCheck = DownloadIntelligence.detectDuplicate(
      { url: params.url, filename: params.filename },
      Array.from(this.downloads.values())
    );

    const probe = await ProbeService.probe(params.url, params.auth, params.proxy).catch(() => {
      const fallbackName = ProbeService.extractFilenameFromUrl(params.url);
      return {
        filename: fallbackName,
        suggestedCategory: ProbeService.categorizeFile(fallbackName),
        mimeType: 'application/octet-stream',
        size: -1,
        capabilities: {
          supportsRange: false,
          redirectChain: [params.url],
          protocol: (params.url.startsWith('https:') ? 'https' : 'http') as any,
          authRequired: false,
          probedAt: Date.now(),
        },
      };
    });

    const category = params.category || probe.suggestedCategory || 'other';

    let destDir = params.destinationDir;
    if (!destDir) {
      const categories = this.db.getCategories();
      const matchedCat = categories.find((c) => c.id === category);
      destDir = matchedCat ? matchedCat.defaultDestination : settings.general.defaultDownloadDir;
    }

    PathSanitizer.ensureDirectory(destDir);

    let filename = params.filename || probe.filename;
    filename = PathSanitizer.sanitizeFilename(filename);

    const finalPath = this.resolveFileCollision(destDir, filename, settings.downloads.fileCollisionAction);
    const resolvedFilename = path.basename(finalPath);
    const tempPath = `${finalPath}.part`;
    const stateFilePath = `${finalPath}.g1dm`;

    const id = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Adaptive connection suggestion from ServerPolicyEngine
    const recommendedConns = this.policyEngine.getRecommendedConnections(
      params.url,
      params.maxConnections || settings.downloads.defaultConnectionsPerDownload || 8
    );

    // Encrypt sensitive auth credentials before storing
    const secureAuth = params.auth
      ? {
          ...params.auth,
          password: params.auth.password ? SecretStore.encryptSecret(params.auth.password) : undefined,
          token: params.auth.token ? SecretStore.encryptSecret(params.auth.token) : undefined,
        }
      : undefined;

    // Pre-Download Malicious Link Scanning
    const safetyWarning = MaliciousLinkScanner.scanUrl(params.url, probe);

    const item: DownloadItem = {
      id,
      url: params.url,
      filename: resolvedFilename,
      destinationDir: destDir,
      finalPath,
      tempPath,
      stateFilePath,
      status: 'queued',
      totalBytes: probe.size,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category,
      queueId: params.queueId || 'default',
      priority: params.priority || 'normal',
      maxConnections: recommendedConns,
      activeConnections: 0,
      segments: [],
      speedHistory: [],
      checksum: params.checksum
        ? { algorithm: params.checksum.algorithm, expected: params.checksum.expected, status: 'none' }
        : { algorithm: 'sha256', status: 'none' },
      serverCapabilities: probe.capabilities,
      auth: secureAuth,
      proxy: params.proxy,
      speedLimitBytesPerSec: params.speedLimitBytesPerSec || 0,
      error: null,
      retryCount: 0,
      maxRetries: settings.downloads.maxRetries || 5,
      createdAt: Date.now(),
      durationMs: 0,
      securityScan: { status: 'unsupported' },
      safetyWarning,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Download created. Size: ${probe.size > 0 ? `${(probe.size / 1024 / 1024).toFixed(2)} MB` : 'Stream'}, Resumable: ${probe.capabilities.supportsRange ? 'Yes' : 'No'}. Duplicate analysis: ${dupCheck.classification}`,
        },
      ],
    };

    let startOk = params.startImmediately !== false;

    if (!safetyWarning.isSafe) {
      item.logs.push({
        timestamp: Date.now(),
        level: 'warn',
        message: `Security Warning: ${safetyWarning.warningTitle} — ${safetyWarning.reasons.join('; ')}`,
      });
      if (safetyWarning.requireUserOverride) {
        item.status = 'paused';
        startOk = false;
      }
    }

    const sm = new DownloadStateMachine(id, 'CREATED');
    sm.transitionTo('QUEUED', 'Item enqueued');
    if (item.status === 'paused') {
      sm.transitionTo('PAUSED', 'Paused due to threat warning override requirement');
    }
    this.stateMachines.set(id, sm);

    this.downloads.set(id, item);
    RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_CREATED', { url: item.url, size: item.totalBytes });
    this.db.saveDownload(item);
    this.emit('item_added', item);

    if (startOk) {
      const activeCount = Array.from(this.downloads.values()).filter((d) => d.status === 'downloading').length;
      if (activeCount < settings.downloads.maxConcurrentDownloads) {
        await this.startDownload(id);
      }
    }

    return item;
  }

  private resolveFileCollision(dir: string, filename: string, action: 'rename' | 'overwrite' | 'skip' | 'ask'): string {
    const originalPath = path.join(dir, filename);
    if (!fs.existsSync(originalPath) || action === 'overwrite') {
      return originalPath;
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    let newPath = path.join(dir, `${base} (${counter})${ext}`);

    while (fs.existsSync(newPath)) {
      counter++;
      newPath = path.join(dir, `${base} (${counter})${ext}`);
    }

    return newPath;
  }

  public async startDownload(id: string): Promise<void> {
    const item = this.downloads.get(id);
    if (!item) throw new Error(`Download not found: ${id}`);

    const sm = this.stateMachines.get(id);
    if (!sm) return;

    if (!sm.canTransitionTo('DOWNLOADING')) {
      if (item.status === 'downloading') return;
    }

    sm.transitionTo('DOWNLOADING', 'Worker starting');
    item.status = 'downloading';
    item.error = null;
    item.speed = 0;
    this.db.saveDownload(item);
    this.emit('item_updated', item);

    // Decrypt credentials for worker execution
    const workerAuth: DownloadAuth | undefined = item.auth
      ? {
          ...item.auth,
          password: item.auth.password ? SecretStore.decryptSecret(item.auth.password) : undefined,
          token: item.auth.token ? SecretStore.decryptSecret(item.auth.token) : undefined,
        }
      : undefined;

    const workerItem = { ...item, auth: workerAuth };

    let worker: HttpDownloader | Http2Downloader | FtpDownloader | HlsDownloader;
    const protocol = item.serverCapabilities.protocol;

    if (protocol === 'ftp' || protocol === 'ftps') {
      worker = new FtpDownloader(workerItem, this.globalRateLimiter);
    } else if (protocol === 'hls') {
      worker = new HlsDownloader(workerItem, this.globalRateLimiter);
    } else {
      worker = new HttpDownloader(workerItem, this.globalRateLimiter);
    }

    this.activeWorkers.set(id, worker);

    worker.on('progress', (updatedItem) => {
      this.downloads.set(id, updatedItem);
      this.emit('item_progress', updatedItem);
    });

    worker.on('completed', async (completedItem) => {
      this.activeWorkers.delete(id);
      if (sm.canTransitionTo('COMPLETED')) {
        sm.transitionTo('COMPLETED', 'Transfer finalized');
      }

      this.downloads.set(id, completedItem);
      RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_COMPLETED', { bytes: completedItem.downloadedBytes });
      this.policyEngine.recordSuccess(completedItem.url, 30, completedItem.avgSpeed, completedItem.downloadedBytes);

      this.db.saveDownload(completedItem);

      // Record to history
      const domain = new URL(completedItem.url).hostname || 'unknown';
      const queueObj = this.db.getQueues().find((q) => q.id === completedItem.queueId);
      this.db.addHistory({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        downloadId: completedItem.id,
        filename: completedItem.filename,
        url: completedItem.url,
        domain,
        date: completedItem.completedAt || Date.now(),
        durationMs: completedItem.durationMs,
        fileSize: completedItem.downloadedBytes || completedItem.totalBytes,
        destinationPath: completedItem.finalPath,
        status: 'completed',
        avgSpeed: completedItem.avgSpeed,
        peakSpeed: completedItem.peakSpeed,
        checksumAlgorithm: completedItem.checksum?.algorithm,
        checksumVerified: completedItem.checksum?.status === 'verified',
        category: completedItem.category,
        queueName: queueObj ? queueObj.name : 'Default Queue',
      });

      if (completedItem.checksum && completedItem.checksum.expected) {
        try {
          const verified = await ChecksumVerifier.verifyChecksum(completedItem.finalPath, completedItem.checksum);
          completedItem.checksum = verified;
          this.db.saveDownload(completedItem);
        } catch {}
      }

      this.emit('item_completed', completedItem);
      this.processQueues();
    });

    worker.on('error', (err, failedItem) => {
      this.activeWorkers.delete(id);
      if (sm.canTransitionTo('FAILED')) {
        sm.transitionTo('FAILED', err.message);
      }

      this.policyEngine.recordFailure(failedItem.url, err.message);
      this.downloads.set(id, failedItem);
      RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_FAILED', { error: err.message });
      this.db.saveDownload(failedItem);
      this.emit('item_error', err, failedItem);

      if (failedItem.retryCount < failedItem.maxRetries) {
        failedItem.retryCount++;
        if (sm.canTransitionTo('RETRYING')) {
          sm.transitionTo('RETRYING', `Retry attempt ${failedItem.retryCount}`);
        }
        failedItem.status = 'queued';
        this.db.saveDownload(failedItem);
        setTimeout(() => {
          if (failedItem.status === 'queued') {
            this.startDownload(id).catch(() => {});
          }
        }, (failedItem.retryCount * 2 + 1) * 1000);
      } else {
        this.processQueues();
      }
    });

    worker.on('log', (level, msg) => {
      this.emit('log', { downloadId: id, level, message: msg });
    });

    worker.start().catch((err) => {
      this.activeWorkers.delete(id);
      if (sm.canTransitionTo('FAILED')) {
        sm.transitionTo('FAILED', err.message);
      }
      item.status = 'failed';
      item.error = {
        code: 'ERR_START_FAILED',
        message: err.message,
        timestamp: Date.now(),
        retryable: true,
        retryCount: item.retryCount,
      };
      this.db.saveDownload(item);
      this.emit('item_error', err, item);
      this.processQueues();
    });
  }

  public pauseDownload(id: string): void {
    const sm = this.stateMachines.get(id);
    const worker = this.activeWorkers.get(id);
    if (worker) {
      worker.pause();
      this.activeWorkers.delete(id);
    }
    const item = this.downloads.get(id);
    if (item) {
      if (sm && sm.canTransitionTo('PAUSED')) {
        sm.transitionTo('PAUSED', 'Paused by user');
      }
      item.status = 'paused';
      item.speed = 0;
      item.activeConnections = 0;
      RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_PAUSED', {});
      this.db.saveDownload(item);
      this.emit('item_updated', item);
    }
    this.processQueues();
  }

  public resumeDownload(id: string): void {
    const item = this.downloads.get(id);
    if (!item) return;
    const sm = this.stateMachines.get(id);
    if (sm && sm.canTransitionTo('RESUMING')) {
      sm.transitionTo('RESUMING', 'Resumed by user');
    }
    item.status = 'queued';
    RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_RESUMED', {});
    this.db.saveDownload(item);
    this.emit('item_updated', item);
    this.startDownload(id).catch(console.error);
  }

  public cancelDownload(id: string): void {
    const sm = this.stateMachines.get(id);
    const worker = this.activeWorkers.get(id);
    if (worker) {
      worker.cancel();
      this.activeWorkers.delete(id);
    }
    const item = this.downloads.get(id);
    if (item) {
      if (sm && sm.canTransitionTo('CANCELED')) {
        sm.transitionTo('CANCELED', 'Cancelled by user');
      }
      item.status = 'cancelled';
      item.speed = 0;
      item.activeConnections = 0;
      this.db.saveDownload(item);
      this.emit('item_updated', item);
    }
    this.processQueues();
  }

  public retryDownload(id: string): void {
    const item = this.downloads.get(id);
    if (!item) return;
    item.error = null;
    item.retryCount = 0;
    this.resumeDownload(id);
  }

  public restartDownload(id: string): void {
    this.pauseDownload(id);
    const item = this.downloads.get(id);
    if (!item) return;

    try {
      if (fs.existsSync(item.tempPath)) fs.unlinkSync(item.tempPath);
      if (fs.existsSync(item.stateFilePath)) fs.unlinkSync(item.stateFilePath);
      if (fs.existsSync(item.finalPath)) fs.unlinkSync(item.finalPath);
    } catch {}

    item.downloadedBytes = 0;
    item.progress = 0;
    item.speed = 0;
    item.eta = 0;
    item.segments = [];
    item.speedHistory = [];
    item.error = null;
    item.retryCount = 0;
    item.status = 'queued';

    const sm = new DownloadStateMachine(id, 'QUEUED');
    this.stateMachines.set(id, sm);

    this.db.saveDownload(item);
    this.emit('item_updated', item);
    this.startDownload(id).catch(console.error);
  }

  public deleteDownload(id: string, deleteFile: boolean = false): void {
    this.pauseDownload(id);
    const item = this.downloads.get(id);
    if (!item) return;

    if (deleteFile) {
      try {
        if (fs.existsSync(item.tempPath)) fs.unlinkSync(item.tempPath);
        if (fs.existsSync(item.stateFilePath)) fs.unlinkSync(item.stateFilePath);
        if (fs.existsSync(item.finalPath)) fs.unlinkSync(item.finalPath);
      } catch {}
    }

    this.downloads.delete(id);
    this.stateMachines.delete(id);
    this.db.deleteDownload(id);
    this.emit('item_deleted', id);
    this.processQueues();
  }

  public pauseAll(): void {
    for (const id of this.activeWorkers.keys()) {
      this.pauseDownload(id);
    }
  }

  public resumeAll(): void {
    for (const item of this.downloads.values()) {
      if (item.status === 'paused' || item.status === 'failed') {
        item.status = 'queued';
        this.db.saveDownload(item);
      }
    }
    this.processQueues();
  }

  public stopAll(): void {
    for (const id of this.activeWorkers.keys()) {
      this.cancelDownload(id);
    }
  }

  public setGlobalSpeedLimit(bytesPerSec: number): void {
    this.globalRateLimiter.setLimit(bytesPerSec);
    const settings = this.db.getSettings();
    settings.downloads.globalSpeedLimitBytesPerSec = bytesPerSec;
    this.db.saveSettings(settings);
  }

  public getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values());
  }

  public getDownload(id: string): DownloadItem | undefined {
    return this.downloads.get(id);
  }

  public getGlobalRateLimit(): number {
    return this.globalRateLimiter.getLimit();
  }

  public getPolicyEngine(): ServerPolicyEngine {
    return this.policyEngine;
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.pauseAll();
    this.db.flush();
  }
}
