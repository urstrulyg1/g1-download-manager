import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
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
import { SecureMediaDetector, looksLikeStreamingMediaSource } from '../media/SecureMediaDetector';
import { ProbeService } from './ProbeService';
import { TokenBucketRateLimiter } from './RateLimiter';
import { ChecksumVerifier } from './ChecksumVerifier';
import { RecoveryJournal } from '../db/RecoveryJournal';
import { SecretStore } from '../security/SecretStore';
import { PathSanitizer } from '../storage/PathSanitizer';
import { FilenameResolver } from '../storage/FilenameResolver';
import { DownloadIntelligence } from './DownloadIntelligence';
import { MaliciousLinkScanner } from '../security/MaliciousLinkScanner';
import { RecoveryOrchestrator } from './RecoveryOrchestrator';
import { BandwidthGovernor } from '../qos/BandwidthGovernor';
import { RuleEngine } from '../automation/RuleEngine';
import { BinaryLocator } from '../platform/BinaryLocator';

export class DownloadEngine extends EventEmitter {
  private db: AppDatabase;
  private downloads: Map<string, DownloadItem> = new Map();
  private stateMachines: Map<string, DownloadStateMachine> = new Map();
  private activeWorkers: Map<
    string,
    HttpDownloader | Http2Downloader | FtpDownloader | HlsDownloader
  > = new Map();
  private policyEngine: ServerPolicyEngine = new ServerPolicyEngine();
  private recoveryOrchestrator: RecoveryOrchestrator;
  private globalRateLimiter: TokenBucketRateLimiter;
  private bandwidthGovernor: BandwidthGovernor;
  private ruleEngine: RuleEngine = new RuleEngine();
  private isShuttingDown = false;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private interruptedRecoveredIds: Set<string> = new Set();

  constructor(db: AppDatabase) {
    super();
    this.db = db;
    this.recoveryOrchestrator = new RecoveryOrchestrator(this.policyEngine, this.db);
    const settings = db.getSettings();
    const globalLimit = settings.downloads.globalSpeedLimitBytesPerSec || 0;
    this.globalRateLimiter = new TokenBucketRateLimiter(globalLimit);
    this.bandwidthGovernor = new BandwidthGovernor(globalLimit);
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
          } else if (stat.size > item.downloadedBytes) {
            item.downloadedBytes = stat.size;
          }
        }

        if (item.totalBytes > 0) {
          item.progress = Math.min(100, Math.round((item.downloadedBytes / item.totalBytes) * 10000) / 100);
        }

        this.interruptedRecoveredIds.add(item.id);

        item.logs.push({
          timestamp: Date.now(),
          level: 'warn',
          message: `Recovered from previous unexpected shutdown (${item.progress.toFixed(1)}% downloaded). Resuming safely.`,
        });

        RecoveryJournal.logEvent(this.db, item.id, 'DOWNLOAD_PAUSED', { reason: 'Crash recovery' });
        this.db.saveDownload(item);
      }
    }
  }

  /**
   * Materializes the queue record for a download target if it does not exist.
   * Driven exclusively by real user download actions — never at startup — so a
   * fresh installation contains zero queue entries until the user adds a
   * download that needs one.
   */
  private ensureQueueExists(queueId: string, defaultDestinationDir: string): void {
    const existing = this.db.getQueues().find((q) => q.id === queueId);
    if (existing) return;

    const queue: DownloadQueue = {
      id: queueId,
      name: queueId === 'default' ? 'Main Download Queue' : queueId,
      priority: 1,
      mode: 'parallel',
      maxConcurrentDownloads: 4,
      maxConnectionsPerDownload: 8,
      speedLimitBytesPerSec: 0,
      destinationDir: defaultDestinationDir,
      status: 'active',
      schedule: {
        enabled: false,
        startTime: '00:00',
        stopTime: '23:59',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        onCompleteAction: 'nothing',
      },
      downloadIds: [],
      createdAt: Date.now(),
    };
    this.db.saveQueue(queue);
  }

  private startEngineLoop(): void {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    this.schedulerInterval = setInterval(() => {
      this.processQueues();
    }, 1000);
    if (this.schedulerInterval && typeof this.schedulerInterval.unref === 'function') {
      this.schedulerInterval.unref();
    }
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
        .filter((d) => d.queueId === queue.id && d.status === 'queued' && !(d as any).manualStartRequired)
        .sort((a, b) => {
          const priorityWeight: Record<Priority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
          const pDiff = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
          if (pDiff !== 0) return pDiff;
          return a.createdAt - b.createdAt;
        });

      for (let i = 0; i < Math.min(queueSlots, queuedItems.length); i++) {
        const item = queuedItems[i];
        const sm = this.stateMachines.get(item.id);
        if (sm && !sm.canTransitionTo('DOWNLOADING') && !sm.canTransitionTo('STARTING')) {
          continue;
        }
        slotsLeft--;
        this.startDownload(item.id).catch((err) => {
          if (!this.isShuttingDown) {
            console.error(`Failed to start queued download ${item.id}:`, err);
          }
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
        contentDispositionFilename: undefined,
        urlFilename: fallbackName,
        finalUrl: params.url,
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

    const ruleMatch = this.ruleEngine.evaluatePreDownloadRules({
      url: params.url,
      filename: params.filename || probe.filename,
      size: probe.size > 0 ? probe.size : undefined,
    });

    let category = params.category || ruleMatch.category || probe.suggestedCategory || 'other';
    if ((category === 'other' || category === 'document') && /\.(mp4|mkv|webm|mov|avi|flv|ts|m4v)$/i.test(params.filename || probe.filename)) {
      category = 'video';
    } else if ((category === 'other' || category === 'document') && /\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i.test(params.filename || probe.filename)) {
      category = 'audio';
    }
    const priority = params.priority || ruleMatch.priority || 'normal';

    // Queues are created lazily, driven by real user actions only: a fresh
    // install ships with 0 queue entries, and the target queue record is
    // materialized the first time a download actually targets it.
    const queueId = params.queueId || 'default';
    this.ensureQueueExists(queueId, settings.general.defaultDownloadDir);

    let destDir = params.destinationDir || ruleMatch.destinationDir;
    if (!destDir) {
      const categories = this.db.getCategories();
      const matchedCat = categories.find((c) => c.id === category);
      destDir = matchedCat ? matchedCat.defaultDestination : settings.general.defaultDownloadDir;
    }

    PathSanitizer.ensureDirectory(destDir);

    const hasExplicitFormatSpec = Boolean((params as any).mediaFormatSpec) || Boolean((params as any).formatSpec);
    const isStreamPlatform =
      looksLikeStreamingMediaSource(
        params.url,
        { filename: probe.filename, mimeType: probe.mimeType },
        hasExplicitFormatSpec
      ) || hasExplicitFormatSpec;

    let mediaAnalysis: any = null;
    if (isStreamPlatform) {
      try {
        mediaAnalysis = await SecureMediaDetector.analyze(params.url, 15000);
      } catch {}
    }

    // --- Centralized filename resolution ------------------------------------
    // Single source of truth for the filename priority chain:
    //   user -> media/yt-dlp title -> Content-Disposition -> HTML/OG title
    //        -> URL filename -> safe fallback.
    const mediaContainer =
      (params as any).container ||
      (params as any).format ||
      mediaAnalysis?.recommendedQuality?.container;
    const isAudio = category === 'audio';

    const resolved = FilenameResolver.resolve({
      url: params.url,
      userFilename: params.filename,
      mediaTitle: mediaAnalysis?.title,
      contentDispositionFilename: probe.contentDispositionFilename,
      pageTitle: mediaAnalysis?.pageTitle,
      probeFilename: probe.filename || probe.urlFilename,
      mimeType: probe.mimeType,
      mediaContainer,
      isAudio,
    });
    let filename = resolved.filename;

    const finalPath = this.resolveFileCollision(destDir, filename, settings.downloads.fileCollisionAction);
    if (finalPath === null) {
      throw new Error(
        `Skipped: "${filename}" already exists in ${destDir} (file collision action is set to "skip").`
      );
    }
    // Filename resolution is defense in depth: ensure every file the engine
    // creates remains below the configured destination, including sidecars.
    if (!PathSanitizer.isPathInsideDirectory(finalPath, destDir)) {
      throw new Error('Resolved filename is outside the configured download directory.');
    }
    const resolvedFilename = path.basename(finalPath);
    const tempPath = `${finalPath}.part`;
    const stateFilePath = `${finalPath}.g1dm`;
    if (!PathSanitizer.isPathInsideDirectory(tempPath, destDir) ||
        !PathSanitizer.isPathInsideDirectory(stateFilePath, destDir)) {
      throw new Error('Download temporary path is outside the configured download directory.');
    }

    const id = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const effectiveTotalBytes =
      probe.size > 0
        ? probe.size
        : mediaAnalysis?.recommendedQuality?.exactSizeBytes ||
          mediaAnalysis?.recommendedQuality?.estimatedSizeBytes ||
          -1;

    // Adaptive connection suggestion from ServerPolicyEngine
    const targetConns = params.maxConnections || ruleMatch.maxConnections || settings.downloads.defaultConnectionsPerDownload || 8;
    const recommendedConns = this.policyEngine.getRecommendedConnections(
      params.url,
      targetConns
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
      totalBytes: effectiveTotalBytes,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      eta: 0,
      category,
      queueId,
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
      maxRetries: settings.downloads.maxRetries ?? 5,
      createdAt: Date.now(),
      durationMs: 0,
      securityScan: { status: 'unsupported' },
      safetyWarning,
      // A queue action is an explicit user choice not to start yet. Keep this
      // marker until the user invokes Start; the queue worker must not promote
      // it automatically during this session.
      manualStartRequired: params.startImmediately === false,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Download created. Size: ${effectiveTotalBytes > 0 ? `${(effectiveTotalBytes / 1024 / 1024).toFixed(2)} MB` : 'Stream'}, Resumable: ${probe.capabilities.supportsRange ? 'Yes' : 'No'}. Duplicate analysis: ${dupCheck.classification}`,
        },
      ],
    };

    let explicitClarity =
      (params as any).qualityLabel ||
      (params as any).clarity ||
      (params as any).resolution ||
      ((params as any).height ? `${(params as any).height}p` : undefined);

    const explicitFormat = (params as any).formatSpec || (params as any).mediaFormatSpec;
    if (!explicitClarity && explicitFormat && typeof explicitFormat === 'string') {
      const hMatch = explicitFormat.match(/height[<=~]*(\d+)/i) || explicitFormat.match(/(\d{3,4})p/i);
      if (hMatch && hMatch[1]) {
        const h = parseInt(hMatch[1], 10);
        if (h >= 3840) explicitClarity = '8K';
        else if (h >= 2160) explicitClarity = '4K';
        else if (h >= 1440) explicitClarity = '1440p';
        else if (h >= 1080) explicitClarity = '1080p';
        else if (h >= 720) explicitClarity = '720p';
        else if (h >= 480) explicitClarity = '480p';
        else if (h >= 360) explicitClarity = '360p';
        else explicitClarity = `${h}p`;
      }
    }

    const clarity = explicitClarity || mediaAnalysis?.recommendedQuality?.resolutionLabel;

    (item as any).thumbnailUrl = mediaAnalysis?.thumbnailUrl || (params as any).thumbnailUrl;
    (item as any).qualityLabel = clarity;
    (item as any).clarity = clarity;
    (item as any).resolution = clarity;
    (item as any).mediaFormatSpec =
      (params as any).formatSpec ||
      (params as any).mediaFormatSpec ||
      (mediaAnalysis?.recommendedQuality as any)?.formatSpec ||
      // Only route to yt-dlp when an explicit format was requested or its
      // analysis found a downloadable media format. HTML/unknown URLs that
      // fail metadata extraction stay on the ordinary streaming HTTP engine.
      undefined;
    (item as any).filenameSource = resolved.source;
    (item as any).mediaMetadata = {
      title: mediaAnalysis?.title || resolved.stem,
      resolution: clarity,
      codec: (params as any).codec || mediaAnalysis?.recommendedQuality?.videoCodec,
      container: (params as any).container || mediaAnalysis?.recommendedQuality?.container || resolved.ext,
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

  /** Resolve (but never download) a media URL with yt-dlp. */
  private async resolveMediaStreamUrl(sourceUrl: string, formatSpec?: string): Promise<string> {
    if (!(await BinaryLocator.isYtDlpAvailable())) {
      throw new Error('Media stream resolution requires yt-dlp; direct files never require it.');
    }
    const format = formatSpec || 'best[protocol^=http][acodec!=none][vcodec!=none]/best[protocol^=http]/best';
    const output = await new Promise<string>((resolve, reject) => {
      execFile(BinaryLocator.getYtDlpPath(), ['--no-warnings', '--no-playlist', '-g', '-f', format, sourceUrl],
        { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    });
    const streamUrl = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https?:\/\//i.test(line));
    if (!streamUrl) throw new Error('Media resolver did not return a downloadable HTTP(S) stream URL.');
    return streamUrl;
  }

  private resolveFileCollision(
    dir: string,
    filename: string,
    action: 'rename' | 'overwrite' | 'skip' | 'ask'
  ): string | null {
    const originalPath = path.join(dir, filename);
    const reserved = Array.from(this.downloads.values()).some((item) =>
      item.finalPath === originalPath && item.status !== 'completed' && item.status !== 'cancelled'
    );
    if ((!fs.existsSync(originalPath) && !reserved) || action === 'overwrite') {
      return originalPath;
    }

    if (action === 'skip') {
      // A file with the same name already exists — do not download.
      return null;
    }

    // 'rename' and 'ask' (headless fallback) both produce a unique name.
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    let newPath = path.join(dir, `${base} (${counter})${ext}`);

    while (fs.existsSync(newPath) || Array.from(this.downloads.values()).some((item) =>
      item.finalPath === newPath && item.status !== 'completed' && item.status !== 'cancelled'
    )) {
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
    (item as any).manualStartRequired = false;

    if (!sm.canTransitionTo('DOWNLOADING')) {
      if (item.status === 'downloading') return;
      if (sm.canTransitionTo('STARTING')) {
        sm.transitionTo('STARTING', 'Worker initializing');
      } else {
        return;
      }
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
    let protocol = item.serverCapabilities.protocol;
    // yt-dlp is allowed to resolve media metadata and an expiring stream URL,
    // but it must not become the ordinary transfer implementation. Resolve a
    // direct URL, reprobe it, then hand the bytes to the same HTTP/HLS workers
    // used for every other G1DM item.
    const isStreamPlatform =
      (protocol as string) === 'media_stream' ||
      Boolean((item as any).mediaFormatSpec);
    if (isStreamPlatform) {
      const streamUrl = await this.resolveMediaStreamUrl(item.url, (item as any).mediaFormatSpec);
      const streamProbe = await ProbeService.probe(streamUrl, workerAuth, item.proxy);
      (item as any).mediaSourceUrl = item.url;
      item.url = streamProbe.finalUrl || streamUrl;
      item.serverCapabilities = streamProbe.capabilities;
      item.totalBytes = streamProbe.size > 0 ? streamProbe.size : item.totalBytes;
      protocol = item.serverCapabilities.protocol;
      this.db.saveDownload(item);
      Object.assign(workerItem, { url: item.url, totalBytes: item.totalBytes, serverCapabilities: item.serverCapabilities });
    }

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
      this.policyEngine.recordFailure(failedItem.url, err.message);

      const decision = this.recoveryOrchestrator.evaluateFailure(failedItem, err);

      // Non-retryable error (e.g. 404, 401/403, permission denied, invalid disk path)
      if (decision.action === 'ABORT_UNRECOVERABLE' || decision.action === 'PAUSE_AND_EXPLAIN') {
        if (sm.canTransitionTo('FAILED')) {
          sm.transitionTo('FAILED', decision.explanation);
        }
        failedItem.status = decision.category === 'STORAGE_FAILURE' ? 'paused' : 'failed';
        failedItem.error = {
          code: decision.category,
          message: decision.explanation,
          technicalDetails: err.stack,
          timestamp: Date.now(),
          retryable: false,
          retryCount: failedItem.retryCount,
        };
        failedItem.speed = 0;
        failedItem.activeConnections = 0;

        this.downloads.set(id, failedItem);
        RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_FAILED', { error: decision.explanation, unrecoverable: true });
        this.db.saveDownload(failedItem);
        this.emit('item_error', err, failedItem);
        this.processQueues();
        return;
      }

      // Retryable error with exponential backoff & jitter
      if (failedItem.retryCount < failedItem.maxRetries) {
        failedItem.retryCount++;
        const backoffMs = decision.backoffMs > 0
          ? decision.backoffMs
          : Math.min(30000, Math.pow(2, failedItem.retryCount) * 1000 + Math.random() * 500);

        if (decision.newConnectionCount) {
          failedItem.maxConnections = decision.newConnectionCount;
        }

        if (sm.canTransitionTo('RETRYING')) {
          sm.transitionTo('RETRYING', `Retry ${failedItem.retryCount}/${failedItem.maxRetries} in ${Math.round(backoffMs / 1000)}s: ${decision.explanation}`);
        }

        failedItem.status = 'queued';
        (failedItem as any).statusMessage = `Retrying in ${Math.round(backoffMs / 1000)}s... (${failedItem.retryCount}/${failedItem.maxRetries})`;
        failedItem.error = {
          code: 'ERR_RETRYING',
          message: `${decision.explanation} (Attempt ${failedItem.retryCount} of ${failedItem.maxRetries})`,
          timestamp: Date.now(),
          retryable: true,
          retryCount: failedItem.retryCount,
        };
        failedItem.speed = 0;
        failedItem.activeConnections = 0;

        this.downloads.set(id, failedItem);
        RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_RESUMED', {
          reason: 'Retry scheduled',
          attempt: failedItem.retryCount,
          backoffMs,
        });
        this.db.saveDownload(failedItem);
        this.emit('item_updated', failedItem);

        setTimeout(() => {
          if (failedItem.status === 'queued') {
            this.startDownload(id).catch(() => {});
          }
        }, backoffMs);
      } else {
        // Max retries reached
        if (sm.canTransitionTo('FAILED')) {
          sm.transitionTo('FAILED', `Max retries (${failedItem.maxRetries}) exhausted: ${err.message}`);
        }
        failedItem.status = 'failed';
        failedItem.error = {
          code: 'ERR_RETRIES_EXHAUSTED',
          message: `Max retries (${failedItem.maxRetries}) exceeded: ${err.message}`,
          technicalDetails: err.stack,
          timestamp: Date.now(),
          retryable: true,
          retryCount: failedItem.retryCount,
        };
        failedItem.speed = 0;
        failedItem.activeConnections = 0;

        this.downloads.set(id, failedItem);
        RecoveryJournal.logEvent(this.db, id, 'DOWNLOAD_FAILED', { error: err.message, retriesExhausted: true });
        this.db.saveDownload(failedItem);
        this.emit('item_error', err, failedItem);
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
    let item = this.downloads.get(id);
    if (!item) {
      item = this.db.getDownload(id) || undefined;
    }

    if (item && deleteFile) {
      try {
        if (item.tempPath && fs.existsSync(item.tempPath)) fs.unlinkSync(item.tempPath);
        if (item.stateFilePath && fs.existsSync(item.stateFilePath)) fs.unlinkSync(item.stateFilePath);
        if (item.finalPath && fs.existsSync(item.finalPath)) fs.unlinkSync(item.finalPath);
        
        // Delete any related .part or .g1dm.part files
        if (item.finalPath) {
          const finalPart = `${item.finalPath}.part`;
          if (fs.existsSync(finalPart)) fs.unlinkSync(finalPart);
          const finalG1dm = `${item.finalPath}.g1dm.part`;
          if (fs.existsSync(finalG1dm)) fs.unlinkSync(finalG1dm);
        }

        // Fallback: check destinationDir + filename
        if (item.destinationDir && item.filename) {
          const fallbackPath = path.join(item.destinationDir, item.filename);
          if (fs.existsSync(fallbackPath)) fs.unlinkSync(fallbackPath);
          const partFallback = `${fallbackPath}.part`;
          if (fs.existsSync(partFallback)) fs.unlinkSync(partFallback);
          const g1dmFallback = `${fallbackPath}.g1dm.part`;
          if (fs.existsSync(g1dmFallback)) fs.unlinkSync(g1dmFallback);
        }
      } catch (err) {
        console.error('Error unlinking files during deleteDownload:', err);
      }
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

  public getInterruptedDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).filter(
      (d) => this.interruptedRecoveredIds.has(d.id) && d.status === 'paused'
    );
  }

  public dismissInterruptedDownloads(): void {
    this.interruptedRecoveredIds.clear();
  }

  public async retryFailed(): Promise<void> {
    const failedItems = Array.from(this.downloads.values()).filter((d) => d.status === 'failed');
    for (const item of failedItems) {
      item.error = null;
      item.retryCount = 0;
      item.status = 'queued';
      this.db.saveDownload(item);
      this.emit('item_updated', item);
    }
    this.processQueues();
  }

  public clearCompleted(): void {
    const completedItems = Array.from(this.downloads.values()).filter((d) => d.status === 'completed');
    for (const item of completedItems) {
      this.downloads.delete(item.id);
      this.stateMachines.delete(item.id);
      this.db.deleteDownload(item.id);
      this.emit('item_deleted', item.id);
    }
  }

  public resumeAll(): void {
    for (const item of this.downloads.values()) {
      if (item.status === 'paused' || item.status === 'failed') {
        item.status = 'queued';
        (item as any).manualStartRequired = false;
        item.error = null;
        this.db.saveDownload(item);
        this.emit('item_updated', item);
      }
    }
    this.processQueues();
  }

  public startAll(): void {
    for (const item of this.downloads.values()) {
      if (item.status === 'paused' || item.status === 'queued' || item.status === 'failed') {
        item.status = 'queued';
        (item as any).manualStartRequired = false;
        item.error = null;
        this.db.saveDownload(item);
        this.emit('item_updated', item);
      }
    }
    this.processQueues();
  }

  public reorderQueueItem(queueId: string, downloadId: string, targetIndex: number): void {
    const queueItems = Array.from(this.downloads.values())
      .filter((d) => d.queueId === queueId && d.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);

    const currentIndex = queueItems.findIndex((d) => d.id === downloadId);
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= queueItems.length) return;

    const [moved] = queueItems.splice(currentIndex, 1);
    queueItems.splice(targetIndex, 0, moved);

    // Adjust createdAt timestamps to preserve new sequence
    const baseTime = Date.now() - queueItems.length * 1000;
    queueItems.forEach((item, idx) => {
      item.createdAt = baseTime + idx * 1000;
      this.db.saveDownload(item);
    });
  }

  public checkDuplicate(params: {
    url: string;
    filename?: string;
    destinationDir?: string;
  }): {
    isDuplicate: boolean;
    classification: string;
    existingItem?: DownloadItem;
    fileExistsOnDisk: boolean;
    existingFilePath?: string;
    reason: string;
  } {
    const dupCheck = DownloadIntelligence.detectDuplicate(
      { url: params.url, filename: params.filename },
      Array.from(this.downloads.values())
    );

    const destDir = params.destinationDir || this.db.getSettings().general.defaultDownloadDir;
    const targetFile = params.filename ? path.join(destDir, params.filename) : null;
    const fileExistsOnDisk = targetFile ? fs.existsSync(targetFile) : false;

    const existing = dupCheck.matchedDownloadId ? this.downloads.get(dupCheck.matchedDownloadId) : undefined;

    return {
      isDuplicate: dupCheck.classification !== 'DIFFERENT_RESOURCE',
      classification: dupCheck.classification,
      existingItem: existing,
      fileExistsOnDisk,
      existingFilePath: fileExistsOnDisk && targetFile ? targetFile : undefined,
      reason: dupCheck.reason,
    };
  }

  public stopAll(): void {
    for (const id of this.activeWorkers.keys()) {
      this.cancelDownload(id);
    }
  }

  public cancelAll(): void {
    for (const item of this.downloads.values()) {
      if (item.status === 'downloading' || item.status === 'queued') {
        this.cancelDownload(item.id);
      }
    }
  }

  public updatePriority(id: string, priority: Priority): void {
    const item = this.downloads.get(id);
    if (!item) return;
    item.priority = priority;
    this.db.saveDownload(item);
    this.emit('item_updated', item);
    this.processQueues();
  }

  public updateBandwidthLimit(id: string, limitBytesPerSec: number): void {
    const item = this.downloads.get(id);
    if (!item) return;
    item.speedLimitBytesPerSec = limitBytesPerSec;
    const worker = this.activeWorkers.get(id);
    if (worker && typeof (worker as any).setSpeedLimit === 'function') {
      (worker as any).setSpeedLimit(limitBytesPerSec);
    }
    this.db.saveDownload(item);
    this.emit('item_updated', item);
  }

  public setGlobalSpeedLimit(bytesPerSec: number): void {
    this.globalRateLimiter.setLimit(bytesPerSec);
    this.bandwidthGovernor.setGlobalLimit(bytesPerSec);
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

  public getBandwidthGovernor(): BandwidthGovernor {
    return this.bandwidthGovernor;
  }

  public getRuleEngine(): RuleEngine {
    return this.ruleEngine;
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
