import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import {
  DownloadItem,
  SegmentInfo,
  DownloadQueue,
  CategoryRule,
  SiteGrabberProject,
  AppSettings,
  SpeedHistoryPoint,
} from '../../shared/types';

export class AppDatabase {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private isDirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly defaultSettings: AppSettings = {
    general: {
      theme: 'dark',
      accentColor: '#3b82f6',
      language: 'en',
      defaultDownloadDir: path.join(process.env.HOME || '/home/user', 'Downloads'),
      playSounds: true,
      desktopNotifications: true,
      startOnBoot: false,
      closeToTray: false,
    },
    downloads: {
      maxConcurrentDownloads: 4,
      defaultConnectionsPerDownload: 8,
      dynamicSegmentation: true,
      connectionTimeoutSec: 15,
      readTimeoutSec: 30,
      maxRetries: 5,
      retryDelaySec: 3,
      fileCollisionAction: 'rename',
      globalSpeedLimitBytesPerSec: 0,
      autoStartDownloads: true,
    },
    network: {
      proxyEnabled: false,
      proxyType: 'http',
      proxyHost: '',
      proxyPort: 8080,
      proxyAuth: false,
      tlsRejectUnauthorized: true,
      perDomainLimits: {},
    },
    browser: {
      interceptDownloads: true,
      interceptExtensions: ['zip', 'exe', 'iso', 'dmg', 'tar', 'gz', 'mp4', 'mkv', 'mp3', 'pdf', '7z', 'rar', 'msi', 'apk', 'deb', 'rpm'],
      excludeDomains: [],
      showConfirmationDialog: true,
      integrationPort: 19830,
      interceptorEnabled: true,
    },
    security: {
      runAntivirusScan: false,
      antivirusCommand: 'clamscan --no-summary',
      redactDiagnostics: true,
      verifySslCertificates: true,
      threatIntelEnabled: false,
      virusTotalApiKey: '',
      urlHausEnabled: true,
      apiKey: '',
    },
    scheduler: {
      workingHoursEnabled: false,
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingHoursSpeedLimit: 524288, // 512 KB/s
      offHoursUnlimited: true,
    },
    automation: {
      webhooksEnabled: false,
      webhookUrl: '',
      customScriptPath: '',
      triggerOnComplete: true,
      triggerOnError: false,
      autoExtractArchives: false,
      archivePasswords: [],
      deleteArchiveAfterExtract: false,
    },
    power: {
      governorEnabled: false,
      actionOnQueueDrained: 'none',
      graceSeconds: 60,
    },
    remote: {
      telegramBotEnabled: false,
      telegramBotToken: '',
      telegramAllowedChatIds: [],
      discordWebhookUrl: '',
      notifyOnComplete: false,
    },
  };

  constructor(customPath?: string) {
    const dataDir = customPath
      ? path.dirname(customPath)
      : path.join(process.env.HOME || '/home/user', '.g1dm');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = customPath || path.join(dataDir, 'g1dm.db');
  }

  public async init(): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      try {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
      } catch (err) {
        console.warn('Failed to load existing database file, creating fresh one:', err);
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    this.migrateSchema();
    this.seedDefaults();
    this.flush();
  }

  private migrateSchema(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        destinationDir TEXT NOT NULL,
        finalPath TEXT NOT NULL,
        tempPath TEXT NOT NULL,
        stateFilePath TEXT NOT NULL,
        status TEXT NOT NULL,
        totalBytes INTEGER NOT NULL,
        downloadedBytes INTEGER NOT NULL,
        progress REAL NOT NULL,
        speed REAL NOT NULL,
        avgSpeed REAL NOT NULL,
        peakSpeed REAL NOT NULL,
        eta INTEGER NOT NULL,
        category TEXT NOT NULL,
        queueId TEXT NOT NULL,
        priority TEXT NOT NULL,
        maxConnections INTEGER NOT NULL,
        activeConnections INTEGER NOT NULL,
        speedLimitBytesPerSec INTEGER NOT NULL,
        errorJson TEXT,
        retryCount INTEGER NOT NULL,
        maxRetries INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        durationMs INTEGER NOT NULL,
        securityScanJson TEXT,
        archiveInfoJson TEXT,
        serverCapabilitiesJson TEXT,
        authJson TEXT,
        proxyJson TEXT,
        checksumJson TEXT,
        logsJson TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS segments (
        downloadId TEXT NOT NULL,
        segmentId INTEGER NOT NULL,
        startOffset INTEGER NOT NULL,
        endOffset INTEGER NOT NULL,
        downloadedBytes INTEGER NOT NULL,
        currentOffset INTEGER NOT NULL,
        status TEXT NOT NULL,
        connectionId INTEGER NOT NULL,
        speed REAL NOT NULL,
        error TEXT,
        updatedAt INTEGER,
        PRIMARY KEY (downloadId, segmentId)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS queues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL,
        mode TEXT NOT NULL,
        maxConcurrentDownloads INTEGER NOT NULL,
        maxConnectionsPerDownload INTEGER NOT NULL,
        speedLimitBytesPerSec INTEGER NOT NULL,
        destinationDir TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduleJson TEXT,
        downloadIdsJson TEXT,
        createdAt INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        defaultDestination TEXT NOT NULL,
        extensionsJson TEXT NOT NULL,
        mimeTypesJson TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS site_grabber_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        startUrl TEXT NOT NULL,
        maxDepth INTEGER NOT NULL,
        stayOnDomain INTEGER NOT NULL,
        allowSubdomains INTEGER NOT NULL,
        filtersJson TEXT NOT NULL,
        destinationDir TEXT NOT NULL,
        status TEXT NOT NULL,
        discoveredUrlsJson TEXT NOT NULL,
        totalDiscovered INTEGER NOT NULL,
        totalDownloaded INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        error TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        valueJson TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        downloadId TEXT NOT NULL,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        date INTEGER NOT NULL,
        durationMs INTEGER NOT NULL,
        fileSize INTEGER NOT NULL,
        destinationPath TEXT NOT NULL,
        status TEXT NOT NULL,
        avgSpeed REAL NOT NULL,
        peakSpeed REAL NOT NULL,
        errorReason TEXT,
        checksumAlgorithm TEXT,
        checksumVerified INTEGER,
        category TEXT NOT NULL,
        queueName TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS speed_history (
        downloadId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        speed REAL NOT NULL
      );
    `);
  }

  private seedDefaults(): void {
    if (!this.db) return;

    // Seed Settings if not present
    const settingsRes = this.db.exec("SELECT valueJson FROM settings WHERE key = 'app_settings'");
    if (settingsRes.length === 0 || settingsRes[0].values.length === 0) {
      this.saveSettings(this.defaultSettings);
    }

    // Seed Default Categories if empty
    const catRes = this.db.exec('SELECT id FROM categories');
    if (catRes.length === 0 || catRes[0].values.length === 0) {
      const defaultCategories: CategoryRule[] = [
        {
          id: 'video',
          name: 'Video',
          icon: 'Video',
          color: '#ef4444',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Videos'),
          extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm3u8'],
          mimeTypes: ['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
        },
        {
          id: 'audio',
          name: 'Audio',
          icon: 'Music',
          color: '#8b5cf6',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Audio'),
          extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
          mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg'],
        },
        {
          id: 'document',
          name: 'Documents',
          icon: 'FileText',
          color: '#3b82f6',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Documents'),
          extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub', 'rtf'],
          mimeTypes: ['application/pdf', 'application/msword', 'text/plain', 'text/csv'],
        },
        {
          id: 'image',
          name: 'Images',
          icon: 'Image',
          color: '#10b981',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Images'),
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'avif'],
          mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        },
        {
          id: 'archive',
          name: 'Compressed',
          icon: 'Archive',
          color: '#f59e0b',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Archives'),
          extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'tgz'],
          mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar'],
        },
        {
          id: 'program',
          name: 'Programs',
          icon: 'Terminal',
          color: '#ec4899',
          defaultDestination: path.join(this.defaultSettings.general.defaultDownloadDir, 'Programs'),
          extensions: ['exe', 'msi', 'deb', 'rpm', 'appimage', 'apk', 'dmg', 'pkg', 'bin', 'sh'],
          mimeTypes: ['application/octet-stream', 'application/x-msdownload', 'application/vnd.debian.binary-package'],
        },
        {
          id: 'other',
          name: 'Other',
          icon: 'Folder',
          color: '#6b7280',
          defaultDestination: this.defaultSettings.general.defaultDownloadDir,
          extensions: [],
          mimeTypes: [],
        },
      ];

      for (const cat of defaultCategories) {
        this.saveCategory(cat);
      }
    }

    // Seed Default Queue if empty
    const queueRes = this.db.exec('SELECT id FROM queues');
    if (queueRes.length === 0 || queueRes[0].values.length === 0) {
      const defaultQueue: DownloadQueue = {
        id: 'default',
        name: 'Main Download Queue',
        priority: 1,
        mode: 'parallel',
        maxConcurrentDownloads: 4,
        maxConnectionsPerDownload: 8,
        speedLimitBytesPerSec: 0,
        destinationDir: this.defaultSettings.general.defaultDownloadDir,
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
      this.saveQueue(defaultQueue);

      const nightQueue: DownloadQueue = {
        id: 'night_queue',
        name: 'Night Scheduler Queue',
        priority: 2,
        mode: 'sequential',
        maxConcurrentDownloads: 2,
        maxConnectionsPerDownload: 16,
        speedLimitBytesPerSec: 0,
        destinationDir: this.defaultSettings.general.defaultDownloadDir,
        status: 'stopped',
        schedule: {
          enabled: true,
          startTime: '01:00',
          stopTime: '06:30',
          daysOfWeek: [1, 2, 3, 4, 5],
          onCompleteAction: 'notification',
        },
        downloadIds: [],
        createdAt: Date.now(),
      };
      this.saveQueue(nightQueue);
    }
  }

  // --- Downloads CRUD ---

  public saveDownload(item: DownloadItem): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO downloads (
        id, url, filename, destinationDir, finalPath, tempPath, stateFilePath,
        status, totalBytes, downloadedBytes, progress, speed, avgSpeed, peakSpeed,
        eta, category, queueId, priority, maxConnections, activeConnections,
        speedLimitBytesPerSec, errorJson, retryCount, maxRetries, createdAt,
        startedAt, completedAt, durationMs, securityScanJson, archiveInfoJson,
        serverCapabilitiesJson, authJson, proxyJson, checksumJson, logsJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        item.id,
        item.url,
        item.filename,
        item.destinationDir,
        item.finalPath,
        item.tempPath,
        item.stateFilePath,
        item.status,
        item.totalBytes,
        item.downloadedBytes,
        item.progress,
        item.speed,
        item.avgSpeed,
        item.peakSpeed,
        item.eta,
        item.category,
        item.queueId,
        item.priority,
        item.maxConnections,
        item.activeConnections,
        item.speedLimitBytesPerSec,
        item.error ? JSON.stringify(item.error) : null,
        item.retryCount,
        item.maxRetries,
        item.createdAt,
        item.startedAt || null,
        item.completedAt || null,
        item.durationMs,
        JSON.stringify(item.securityScan),
        item.archiveInfo ? JSON.stringify(item.archiveInfo) : null,
        JSON.stringify(item.serverCapabilities),
        item.auth ? JSON.stringify(item.auth) : null,
        item.proxy ? JSON.stringify(item.proxy) : null,
        JSON.stringify(item.checksum),
        JSON.stringify(item.logs),
      ]
    );

    // Save segments
    if (item.segments && item.segments.length > 0) {
      this.db.run('DELETE FROM segments WHERE downloadId = ?', [item.id]);
      for (const seg of item.segments) {
        this.db.run(
          `
          INSERT INTO segments (
            downloadId, segmentId, startOffset, endOffset, downloadedBytes,
            currentOffset, status, connectionId, speed, error, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            item.id,
            seg.id,
            seg.startOffset,
            seg.endOffset,
            seg.downloadedBytes,
            seg.currentOffset,
            seg.status,
            seg.connectionId,
            seg.speed,
            seg.error || null,
            seg.updatedAt || Date.now(),
          ]
        );
      }
    }

    // Save speed history (bounded in-memory ring buffer — cheap to rewrite).
    if (item.speedHistory && item.speedHistory.length > 0) {
      this.db.run('DELETE FROM speed_history WHERE downloadId = ?', [item.id]);
      for (const point of item.speedHistory) {
        this.db.run(
          'INSERT INTO speed_history (downloadId, timestamp, speed) VALUES (?, ?, ?)',
          [item.id, point.timestamp, point.speed]
        );
      }
    }

    this.markDirty();
  }

  public getDownload(id: string): DownloadItem | null {
    if (!this.db) return null;
    const stmt = this.db.prepare('SELECT * FROM downloads WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();

    return this.mapDownloadRow(row);
  }

  public getAllDownloads(): DownloadItem[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM downloads ORDER BY createdAt DESC');
    if (res.length === 0) return [];
    const columns = res[0].columns;
    const items: DownloadItem[] = [];
    for (const val of res[0].values) {
      const row: any = {};
      columns.forEach((col, idx) => {
        row[col] = val[idx];
      });
      items.push(this.mapDownloadRow(row));
    }
    return items;
  }

  private mapDownloadRow(row: any): DownloadItem {
    const segments: SegmentInfo[] = [];
    if (this.db) {
      const segRes = this.db.exec('SELECT * FROM segments WHERE downloadId = ? ORDER BY segmentId ASC', [row.id]);
      if (segRes.length > 0) {
        const segCols = segRes[0].columns;
        for (const segVal of segRes[0].values) {
          const sRow: any = {};
          segCols.forEach((c, i) => (sRow[c] = segVal[i]));
          segments.push({
            id: Number(sRow.segmentId),
            startOffset: Number(sRow.startOffset),
            endOffset: Number(sRow.endOffset),
            downloadedBytes: Number(sRow.downloadedBytes),
            currentOffset: Number(sRow.currentOffset),
            status: sRow.status,
            connectionId: Number(sRow.connectionId),
            speed: Number(sRow.speed),
            error: sRow.error || undefined,
            updatedAt: sRow.updatedAt ? Number(sRow.updatedAt) : undefined,
          });
        }
      }
    }

    const speedHistory: SpeedHistoryPoint[] = [];
    if (this.db) {
      const histRes = this.db.exec(
        'SELECT timestamp, speed FROM speed_history WHERE downloadId = ? ORDER BY timestamp ASC',
        [row.id]
      );
      if (histRes.length > 0) {
        const cols = histRes[0].columns;
        for (const hv of histRes[0].values) {
          const hRow: any = {};
          cols.forEach((c, i) => (hRow[c] = hv[i]));
          speedHistory.push({ timestamp: Number(hRow.timestamp), speed: Number(hRow.speed) });
        }
      }
    }

    return {
      id: row.id,
      url: row.url,
      filename: row.filename,
      destinationDir: row.destinationDir,
      finalPath: row.finalPath,
      tempPath: row.tempPath,
      stateFilePath: row.stateFilePath,
      status: row.status,
      totalBytes: Number(row.totalBytes),
      downloadedBytes: Number(row.downloadedBytes),
      progress: Number(row.progress),
      speed: Number(row.speed),
      avgSpeed: Number(row.avgSpeed),
      peakSpeed: Number(row.peakSpeed),
      eta: Number(row.eta),
      category: row.category,
      queueId: row.queueId,
      priority: row.priority,
      maxConnections: Number(row.maxConnections),
      activeConnections: Number(row.activeConnections),
      speedLimitBytesPerSec: Number(row.speedLimitBytesPerSec),
      error: row.errorJson ? JSON.parse(row.errorJson) : null,
      retryCount: Number(row.retryCount),
      maxRetries: Number(row.maxRetries),
      createdAt: Number(row.createdAt),
      startedAt: row.startedAt ? Number(row.startedAt) : undefined,
      completedAt: row.completedAt ? Number(row.completedAt) : undefined,
      durationMs: Number(row.durationMs || 0),
      securityScan: row.securityScanJson ? JSON.parse(row.securityScanJson) : { status: 'unsupported' },
      archiveInfo: row.archiveInfoJson ? JSON.parse(row.archiveInfoJson) : undefined,
      serverCapabilities: row.serverCapabilitiesJson
        ? JSON.parse(row.serverCapabilitiesJson)
        : { supportsRange: false, redirectChain: [], protocol: 'http', authRequired: false, probedAt: 0 },
      auth: row.authJson ? JSON.parse(row.authJson) : undefined,
      proxy: row.proxyJson ? JSON.parse(row.proxyJson) : undefined,
      checksum: row.checksumJson ? JSON.parse(row.checksumJson) : { algorithm: 'sha256', status: 'none' },
      logs: row.logsJson ? JSON.parse(row.logsJson) : [],
      segments,
      speedHistory,
    };
  }

  public deleteDownload(id: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM downloads WHERE id = ?', [id]);
    this.db.run('DELETE FROM segments WHERE downloadId = ?', [id]);
    this.db.run('DELETE FROM speed_history WHERE downloadId = ?', [id]);
    this.markDirty();
  }

  // --- Queues CRUD ---

  public saveQueue(queue: DownloadQueue): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO queues (
        id, name, priority, mode, maxConcurrentDownloads, maxConnectionsPerDownload,
        speedLimitBytesPerSec, destinationDir, status, scheduleJson, downloadIdsJson, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        queue.id,
        queue.name,
        queue.priority,
        queue.mode,
        queue.maxConcurrentDownloads,
        queue.maxConnectionsPerDownload,
        queue.speedLimitBytesPerSec,
        queue.destinationDir,
        queue.status,
        JSON.stringify(queue.schedule),
        JSON.stringify(queue.downloadIds),
        queue.createdAt,
      ]
    );
    this.markDirty();
  }

  public getQueues(): DownloadQueue[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM queues ORDER BY priority ASC, createdAt ASC');
    if (res.length === 0) return [];
    const columns = res[0].columns;
    return res[0].values.map((val) => {
      const row: any = {};
      columns.forEach((c, i) => (row[c] = val[i]));
      return {
        id: row.id,
        name: row.name,
        priority: Number(row.priority),
        mode: row.mode,
        maxConcurrentDownloads: Number(row.maxConcurrentDownloads),
        maxConnectionsPerDownload: Number(row.maxConnectionsPerDownload),
        speedLimitBytesPerSec: Number(row.speedLimitBytesPerSec),
        destinationDir: row.destinationDir,
        status: row.status,
        schedule: JSON.parse(row.scheduleJson),
        downloadIds: JSON.parse(row.downloadIdsJson || '[]'),
        createdAt: Number(row.createdAt),
      };
    });
  }

  public deleteQueue(id: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM queues WHERE id = ?', [id]);
    this.markDirty();
  }

  // --- Categories CRUD ---

  public saveCategory(cat: CategoryRule): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO categories (
        id, name, icon, color, defaultDestination, extensionsJson, mimeTypesJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        cat.id,
        cat.name,
        cat.icon,
        cat.color,
        cat.defaultDestination,
        JSON.stringify(cat.extensions),
        JSON.stringify(cat.mimeTypes),
      ]
    );
    this.markDirty();
  }

  public getCategories(): CategoryRule[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM categories');
    if (res.length === 0) return [];
    const columns = res[0].columns;
    return res[0].values.map((val) => {
      const row: any = {};
      columns.forEach((c, i) => (row[c] = val[i]));
      return {
        id: row.id,
        name: row.name,
        icon: row.icon,
        color: row.color,
        defaultDestination: row.defaultDestination,
        extensions: JSON.parse(row.extensionsJson),
        mimeTypes: JSON.parse(row.mimeTypesJson),
      };
    });
  }

  public deleteCategory(id: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM categories WHERE id = ?', [id]);
    this.markDirty();
  }

  // --- Site Grabber Projects ---

  public saveGrabberProject(proj: SiteGrabberProject): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO site_grabber_projects (
        id, name, startUrl, maxDepth, stayOnDomain, allowSubdomains,
        filtersJson, destinationDir, status, discoveredUrlsJson,
        totalDiscovered, totalDownloaded, createdAt, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        proj.id,
        proj.name,
        proj.startUrl,
        proj.maxDepth,
        proj.stayOnDomain ? 1 : 0,
        proj.allowSubdomains ? 1 : 0,
        JSON.stringify(proj.filters),
        proj.destinationDir,
        proj.status,
        JSON.stringify(proj.discoveredUrls),
        proj.totalDiscovered,
        proj.totalDownloaded,
        proj.createdAt,
        proj.error || null,
      ]
    );
    this.markDirty();
  }

  public getGrabberProjects(): SiteGrabberProject[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM site_grabber_projects ORDER BY createdAt DESC');
    if (res.length === 0) return [];
    const columns = res[0].columns;
    return res[0].values.map((val) => {
      const row: any = {};
      columns.forEach((c, i) => (row[c] = val[i]));
      return {
        id: row.id,
        name: row.name,
        startUrl: row.startUrl,
        maxDepth: Number(row.maxDepth),
        stayOnDomain: row.stayOnDomain === 1,
        allowSubdomains: row.allowSubdomains === 1,
        filters: JSON.parse(row.filtersJson),
        destinationDir: row.destinationDir,
        status: row.status,
        discoveredUrls: JSON.parse(row.discoveredUrlsJson || '[]'),
        totalDiscovered: Number(row.totalDiscovered),
        totalDownloaded: Number(row.totalDownloaded),
        createdAt: Number(row.createdAt),
        error: row.error || undefined,
      };
    });
  }

  public deleteGrabberProject(id: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM site_grabber_projects WHERE id = ?', [id]);
    this.markDirty();
  }

  // --- Settings ---

  public getSettings(): AppSettings {
    if (!this.db) return this.defaultSettings;
    const res = this.db.exec("SELECT valueJson FROM settings WHERE key = 'app_settings'");
    if (res.length === 0 || res[0].values.length === 0) {
      return this.defaultSettings;
    }
    try {
      const parsed = JSON.parse(String(res[0].values[0][0]));
      return {
        ...this.defaultSettings,
        ...parsed,
        general: {
          ...this.defaultSettings.general,
          ...(parsed.general || {}),
          // Older profiles may contain the removed OLED/System values.
          theme: parsed.general?.theme === 'light' ? 'light' : 'dark',
        },
        downloads: { ...this.defaultSettings.downloads, ...(parsed.downloads || {}) },
        network: { ...this.defaultSettings.network, ...(parsed.network || {}) },
        browser: { ...this.defaultSettings.browser, ...(parsed.browser || {}) },
        security: { ...this.defaultSettings.security, ...(parsed.security || {}) },
        scheduler: { ...this.defaultSettings.scheduler, ...(parsed.scheduler || {}) },
        automation: { ...this.defaultSettings.automation, ...(parsed.automation || {}) },
        power: { ...this.defaultSettings.power, ...(parsed.power || {}) },
        remote: { ...this.defaultSettings.remote, ...(parsed.remote || {}) },
      };
    } catch {
      return this.defaultSettings;
    }
  }

  public saveSettings(settings: AppSettings): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO settings (key, valueJson, updatedAt)
      VALUES (?, ?, ?)
    `,
      ['app_settings', JSON.stringify(settings), Date.now()]
    );
    this.markDirty();
  }

  // --- History ---

  public addHistory(entry: {
    id: string;
    downloadId: string;
    filename: string;
    url: string;
    domain: string;
    date: number;
    durationMs: number;
    fileSize: number;
    destinationPath: string;
    status: string;
    avgSpeed: number;
    peakSpeed: number;
    errorReason?: string;
    checksumAlgorithm?: string;
    checksumVerified?: boolean;
    category: string;
    queueName: string;
  }): void {
    if (!this.db) return;
    this.db.run(
      `
      INSERT OR REPLACE INTO history (
        id, downloadId, filename, url, domain, date, durationMs, fileSize,
        destinationPath, status, avgSpeed, peakSpeed, errorReason,
        checksumAlgorithm, checksumVerified, category, queueName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.downloadId,
        entry.filename,
        entry.url,
        entry.domain,
        entry.date,
        entry.durationMs,
        entry.fileSize,
        entry.destinationPath,
        entry.status,
        entry.avgSpeed,
        entry.peakSpeed,
        entry.errorReason || null,
        entry.checksumAlgorithm || null,
        entry.checksumVerified ? 1 : 0,
        entry.category,
        entry.queueName,
      ]
    );
    this.markDirty();
  }

  public getHistory(): any[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM history ORDER BY date DESC');
    if (res.length === 0) return [];
    const columns = res[0].columns;

    // Numeric columns stored in SQLite — coerce back to JS numbers/booleans
    // so API consumers don't receive raw SQL values.
    const intColumns = new Set(['date', 'durationMs', 'fileSize']);
    const realColumns = new Set(['avgSpeed', 'peakSpeed']);

    return res[0].values.map((val) => {
      const row: any = {};
      columns.forEach((c, i) => {
        if (c === 'checksumVerified') {
          row[c] = val[i] === 1;
        } else if (intColumns.has(c)) {
          row[c] = Number(val[i]);
        } else if (realColumns.has(c)) {
          row[c] = Number(val[i]);
        } else {
          row[c] = val[i];
        }
      });
      return row;
    });
  }

  public clearHistory(): void {
    if (!this.db) return;
    this.db.run('DELETE FROM history');
    this.markDirty();
  }

  // --- Persistence & Atomic Write ---

  private markDirty(): void {
    this.isDirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, 500);
    }
  }

  public flush(): void {
    if (!this.db || !this.isDirty) return;
    try {
      const data = this.db.export();
      const tempPath = `${this.dbPath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, Buffer.from(data));
      fs.renameSync(tempPath, this.dbPath);
      this.isDirty = false;
    } catch (err) {
      console.error('Failed to flush database to disk:', err);
    }
  }

  public close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.flush();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
