export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type ProtocolType = 'http' | 'https' | 'ftp' | 'ftps' | 'hls';

export interface SegmentInfo {
  id: number;
  startOffset: number;
  endOffset: number;
  downloadedBytes: number;
  currentOffset: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'paused';
  connectionId: number;
  speed: number;
  error?: string;
  updatedAt?: number;
}

export interface SpeedHistoryPoint {
  timestamp: number;
  speed: number;
}

export interface ChecksumInfo {
  algorithm: 'sha256' | 'sha512' | 'md5';
  expected?: string;
  actual?: string;
  status: 'none' | 'pending' | 'verified' | 'failed';
  verifiedAt?: number;
}

export interface ServerCapabilities {
  supportsRange: boolean;
  acceptRangesHeader?: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  transferEncoding?: string;
  redirectChain: string[];
  httpStatus?: number;
  protocol: ProtocolType;
  authRequired: boolean;
  tlsCipher?: string;
  tlsVersion?: string;
  serverSoftware?: string;
  probedAt: number;
}

export interface DownloadAuth {
  username?: string;
  password?: string;
  token?: string;
  cookies?: string;
  customHeaders?: Record<string, string>;
}

export interface ProxyConfig {
  enabled: boolean;
  type: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  auth?: boolean;
  username?: string;
  password?: string;
}

export interface DownloadError {
  code: string;
  message: string;
  technicalDetails?: string;
  timestamp: number;
  retryable: boolean;
  retryCount: number;
}

export interface SecurityScanInfo {
  status: 'unsupported' | 'scanning' | 'clean' | 'threat' | 'error';
  scannerName?: string;
  resultDetails?: string;
  timestamp?: number;
}

export interface UrlSafetyScanResult {
  url: string;
  isSafe: boolean;
  riskScore: number;
  riskLevel: 'SAFE' | 'SUSPICIOUS' | 'HIGH_RISK' | 'CRITICAL_MALICIOUS';
  threatType:
    | 'SAFE'
    | 'PHISHING_URL'
    | 'DRIVE_BY_MALWARE'
    | 'SUSPICIOUS_IP_DOWNLOAD'
    | 'DISGUISED_EXECUTABLE'
    | 'MIME_SPOOFING'
    | 'HIGH_REDIRECT_CHAIN';
  warningTitle: string;
  warningDetails: string;
  reasons: string[];
  recommendation: string;
  requireUserOverride: boolean;
  scannedAt: number;
}

export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  modifiedDate: string;
  isDirectory: boolean;
  isEncrypted: boolean;
}

export type ArchiveType =
  | 'zip'
  | 'jar'
  | 'apk'
  | 'tar'
  | 'tar.gz'
  | 'tgz'
  | 'gz'
  | 'bz2'
  | 'xz'
  | 'zst'
  | '7z'
  | 'rar'
  | 'iso';

export interface ArchiveInfo {
  isArchive: boolean;
  archiveType?: ArchiveType;
  entryCount: number;
  totalUncompressedSize: number;
  files: ArchiveEntry[];
  hasDangerousPath?: boolean;
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  destinationDir: string;
  finalPath: string;
  tempPath: string;
  stateFilePath: string;
  status: DownloadStatus;
  totalBytes: number;
  downloadedBytes: number;
  progress: number;
  speed: number;
  avgSpeed: number;
  peakSpeed: number;
  eta: number;
  category: string;
  queueId: string;
  priority: Priority;
  maxConnections: number;
  activeConnections: number;
  segments: SegmentInfo[];
  speedHistory: SpeedHistoryPoint[];
  checksum: ChecksumInfo;
  serverCapabilities: ServerCapabilities;
  auth?: DownloadAuth;
  proxy?: ProxyConfig;
  speedLimitBytesPerSec: number;
  error: DownloadError | null;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs: number;
  securityScan: SecurityScanInfo;
  safetyWarning?: UrlSafetyScanResult;
  archiveInfo?: ArchiveInfo;
  logs: { timestamp: number; level: 'info' | 'warn' | 'error'; message: string }[];
  /** Session-level guard for queued items explicitly created without auto-start. */
  manualStartRequired?: boolean;
}

export interface QueueSchedule {
  enabled: boolean;
  startTime: string; // "HH:MM"
  stopTime: string; // "HH:MM"
  daysOfWeek: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  onCompleteAction: 'nothing' | 'sleep' | 'shutdown' | 'notification' | 'run_command';
  commandToRun?: string;
}

export interface DownloadQueue {
  id: string;
  name: string;
  priority: number;
  mode: 'sequential' | 'parallel';
  maxConcurrentDownloads: number;
  maxConnectionsPerDownload: number;
  speedLimitBytesPerSec: number;
  destinationDir: string;
  status: 'active' | 'paused' | 'stopped';
  schedule: QueueSchedule;
  downloadIds: string[];
  createdAt: number;
}

export interface CategoryRule {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultDestination: string;
  extensions: string[];
  mimeTypes: string[];
}

export interface SiteGrabberDiscoveredUrl {
  url: string;
  depth: number;
  status: 'discovered' | 'enqueued' | 'downloaded' | 'skipped' | 'failed';
  size?: number;
  contentType?: string;
  path?: string;
  error?: string;
}

export interface SiteGrabberProject {
  id: string;
  name: string;
  startUrl: string;
  maxDepth: number;
  stayOnDomain: boolean;
  allowSubdomains: boolean;
  filters: {
    includeExtensions: string[];
    excludeExtensions: string[];
    minSize?: number;
    maxSize?: number;
  };
  destinationDir: string;
  status: 'idle' | 'crawling' | 'downloading' | 'completed' | 'paused' | 'failed';
  discoveredUrls: SiteGrabberDiscoveredUrl[];
  totalDiscovered: number;
  totalDownloaded: number;
  createdAt: number;
  error?: string;
}

export interface MediaFormatOption {
  formatId: string;
  ext: string;
  resolution?: string;
  codec?: string;
  fps?: number;
  bitrate?: number;
  filesize?: number;
  isAudioOnly?: boolean;
  isVideoOnly?: boolean;
  url: string;
  protocol: 'http' | 'hls' | 'dash';
  qualityLabel?: string;
}

export interface MediaDetectionResult {
  url: string;
  title: string;
  pageUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  formats: MediaFormatOption[];
  isProtected: boolean;
  protectionReason?: string;
}

export interface LinkBatchCandidate {
  url: string;
  filename: string;
  extension: string;
  size?: number;
  mimeType?: string;
  category: string;
  selected: boolean;
}

export interface AppSettings {
  general: {
    theme: 'dark' | 'light';
    accentColor: string;
    language: string;
    defaultDownloadDir: string;
    playSounds: boolean;
    desktopNotifications: boolean;
    startOnBoot: boolean;
    closeToTray: boolean;
  };
  downloads: {
    maxConcurrentDownloads: number;
    defaultConnectionsPerDownload: number;
    dynamicSegmentation: boolean;
    connectionTimeoutSec: number;
    readTimeoutSec: number;
    maxRetries: number;
    retryDelaySec: number;
    fileCollisionAction: 'rename' | 'overwrite' | 'skip' | 'ask';
    globalSpeedLimitBytesPerSec: number;
    autoStartDownloads: boolean;
  };
  network: {
    proxyEnabled: boolean;
    proxyType: 'http' | 'https' | 'socks5';
    proxyHost: string;
    proxyPort: number;
    proxyAuth: boolean;
    proxyUsername?: string;
    proxyPassword?: string;
    tlsRejectUnauthorized: boolean;
    perDomainLimits: Record<string, { maxConnections: number; speedLimit: number }>;
  };
  browser: {
    interceptDownloads: boolean;
    interceptExtensions: string[];
    excludeDomains: string[];
    showConfirmationDialog: boolean;
    integrationPort: number;
    interceptorEnabled: boolean;
  };
  security: {
    runAntivirusScan: boolean;
    antivirusCommand: string;
    redactDiagnostics: boolean;
    verifySslCertificates: boolean;
    threatIntelEnabled: boolean;
    virusTotalApiKey: string;
    urlHausEnabled: boolean;
    apiKey: string;
  };
  scheduler: {
    workingHoursEnabled: boolean;
    workingHoursStart: string;
    workingHoursEnd: string;
    workingHoursSpeedLimit: number;
    offHoursUnlimited: boolean;
  };
  automation: {
    webhooksEnabled: boolean;
    webhookUrl: string;
    customScriptPath: string;
    triggerOnComplete: boolean;
    triggerOnError: boolean;
    autoExtractArchives: boolean;
    archivePasswords: string[];
    deleteArchiveAfterExtract: boolean;
  };
  power: {
    governorEnabled: boolean;
    actionOnQueueDrained: 'none' | 'notify' | 'sleep' | 'shutdown' | 'hibernate';
    graceSeconds: number;
  };
  remote: {
    telegramBotEnabled: boolean;
    telegramBotToken: string;
    telegramAllowedChatIds: string[];
    discordWebhookUrl: string;
    notifyOnComplete: boolean;
  };
}

export interface DiagnosticCheckResult {
  id: string;
  category: 'network' | 'storage' | 'engine' | 'security' | 'browser';
  name: string;
  status: 'ok' | 'warning' | 'error' | 'unsupported';
  message: string;
  details?: string;
  timestamp: number;
}

export interface SystemMetrics {
  network: {
    online: boolean;
    interfaces: { name: string; address: string; family: string; internal: boolean }[];
    activeDownloadSpeed: number;
    activeUploadSpeed: number;
    totalBytesDownloaded: number;
    pingLatencyMs: number;
  };
  storage: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    downloadDir: string;
    downloadDirFreeBytes: number;
    tempDirFreeBytes: number;
  };
  engine: {
    activeWorkers: number;
    totalConnections: number;
    queuedJobs: number;
    memoryUsageBytes: number;
    uptimeSeconds: number;
  };
  diagnostics: DiagnosticCheckResult[];
}

export interface SmartRecommendation {
  id: string;
  type: 'warning' | 'optimization' | 'info' | 'action_required';
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: 'change_connections' | 'retry_download' | 'clean_storage' | 'switch_queue' | 'configure_proxy';
  actionPayload?: any;
  createdAt: number;
}

export interface MaintenanceScanResult {
  orphanedPartialFiles: { path: string; size: number; modifiedAt: number }[];
  brokenRecords: { id: string; filename: string; reason: string }[];
  missingDestinationFiles: { id: string; path: string; filename: string }[];
  totalRecoverableBytes: number;
}
