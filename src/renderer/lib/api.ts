import {
  DownloadItem,
  DownloadQueue,
  CategoryRule,
  AppSettings,
  SystemMetrics,
  DiagnosticCheckResult,
  MediaDetectionResult,
  LinkBatchCandidate,
  SiteGrabberProject,
  MaintenanceScanResult,
  ChecksumInfo,
  SecurityScanInfo,
  ArchiveInfo,
} from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function req<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 30_000, signal, ...request } = options;
  const controller = new AbortController();
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  let res: Response;
  try {
    res = await fetch(`/api${endpoint}`, {
      ...request,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...(request.headers || {}),
      },
    });
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') throw new ApiError('Request timed out or was cancelled', undefined, requestId);
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', undefined, requestId);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {}
    throw new ApiError(errMsg, res.status, requestId);
  }

  return res.json();
}

export const api = {
  // Downloads
  getDownloads: () => req<DownloadItem[]>('/downloads'),
  getDownload: (id: string) => req<DownloadItem>(`/downloads/${id}`),
  addDownload: (payload: any) => req<DownloadItem>('/downloads', { method: 'POST', body: JSON.stringify(payload) }),
  probeUrl: (url: string, auth?: any, proxy?: any) =>
    req<any>('/probe', { method: 'POST', body: JSON.stringify({ url, auth, proxy }) }),
  startDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/start`, { method: 'POST' }),
  pauseDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/pause`, { method: 'POST' }),
  resumeDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/resume`, { method: 'POST' }),
  cancelDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/cancel`, { method: 'POST' }),
  retryDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/retry`, { method: 'POST' }),
  restartDownload: (id: string) => req<{ success: boolean }>(`/downloads/${id}/restart`, { method: 'POST' }),
  deleteDownload: (id: string, deleteFile = false) =>
    req<{ success: boolean }>(`/downloads/${id}?deleteFile=${deleteFile}`, { method: 'DELETE' }),
  pauseAll: () => req<{ success: boolean }>('/downloads/pause-all', { method: 'POST' }),
  resumeAll: () => req<{ success: boolean }>('/downloads/resume-all', { method: 'POST' }),
  startAll: () => req<{ success: boolean }>('/downloads/start-all', { method: 'POST' }),
  retryFailed: () => req<{ success: boolean }>('/downloads/retry-failed', { method: 'POST' }),
  clearCompleted: () => req<{ success: boolean }>('/downloads/clear-completed', { method: 'POST' }),
  cancelAll: () => req<{ success: boolean }>('/downloads/cancel-all', { method: 'POST' }),
  stopAll: () => req<{ success: boolean }>('/downloads/stop-all', { method: 'POST' }),
  updatePriority: (id: string, priority: string) =>
    req<{ success: boolean }>(`/downloads/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) }),
  updateBandwidthLimit: (id: string, limitBytesPerSec: number) =>
    req<{ success: boolean }>(`/downloads/${id}/bandwidth`, { method: 'PATCH', body: JSON.stringify({ limitBytesPerSec }) }),
  getInterruptedDownloads: () => req<DownloadItem[]>('/downloads/interrupted'),
  dismissInterruptedDownloads: () => req<{ success: boolean }>('/downloads/interrupted/dismiss', { method: 'POST' }),
  checkDuplicate: (payload: { url: string; filename?: string; destinationDir?: string }) =>
    req<{
      isDuplicate: boolean;
      classification: string;
      existingItem?: DownloadItem;
      fileExistsOnDisk: boolean;
      existingFilePath?: string;
      reason: string;
    }>('/downloads/check-duplicate', { method: 'POST', body: JSON.stringify(payload) }),
  verifyChecksum: (id: string, checksum?: ChecksumInfo) =>
    req<ChecksumInfo>(`/downloads/${id}/verify`, { method: 'POST', body: JSON.stringify({ checksum }) }),
  scanFile: (id: string) => req<SecurityScanInfo>(`/downloads/${id}/scan`, { method: 'POST' }),
  inspectArchive: (id: string) => req<ArchiveInfo>(`/downloads/${id}/archive`),
  openFile: (id: string) => req<{ success: boolean }>(`/downloads/${id}/open-file`, { method: 'POST' }),
  openFolder: (id: string) => req<{ success: boolean }>(`/downloads/${id}/open-folder`, { method: 'POST' }),

  // Queues
  getQueues: () => req<DownloadQueue[]>('/queues'),
  saveQueue: (queue: Partial<DownloadQueue>) =>
    req<DownloadQueue>('/queues', { method: 'POST', body: JSON.stringify(queue) }),
  reorderQueue: (queueId: string, downloadId: string, targetIndex: number) =>
    req<{ success: boolean }>(`/queues/${queueId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ downloadId, targetIndex }),
    }),
  deleteQueue: (id: string) => req<{ success: boolean }>(`/queues/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => req<CategoryRule[]>('/categories'),
  saveCategory: (category: Partial<CategoryRule>) =>
    req<CategoryRule>('/categories', { method: 'POST', body: JSON.stringify(category) }),
  deleteCategory: (id: string) => req<{ success: boolean }>(`/categories/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => req<AppSettings>('/settings'),
  saveSettings: (settings: AppSettings) =>
    req<AppSettings>('/settings', { method: 'POST', body: JSON.stringify(settings) }),
  setSpeedLimit: (bytesPerSec: number) =>
    req<{ success: boolean; speedLimit: number }>('/settings/speed-limit', {
      method: 'POST',
      body: JSON.stringify({ bytesPerSec }),
    }),

  // Metrics
  getMetrics: () => req<SystemMetrics>('/metrics'),

  // History
  getHistory: () => req<any[]>('/history'),
  clearHistory: () => req<{ success: boolean }>('/history', { method: 'DELETE' }),

  // Diagnostics
  runDiagnostics: () => req<DiagnosticCheckResult[]>('/diagnostics/run', { method: 'POST' }),

  // Media
  detectMedia: (url: string) => req<MediaDetectionResult>('/media/detect', { method: 'POST', body: JSON.stringify({ url }) }),

  // Batch links
  extractBatchLinks: (input: string) =>
    req<LinkBatchCandidate[]>('/batch/extract', { method: 'POST', body: JSON.stringify({ input }) }),

  // Site Grabber
  getGrabberProjects: () => req<SiteGrabberProject[]>('/grabber/projects'),
  saveGrabberProject: (project: Partial<SiteGrabberProject>) =>
    req<SiteGrabberProject>('/grabber/projects', { method: 'POST', body: JSON.stringify(project) }),
  startGrabberProject: (id: string) => req<{ success: boolean }>(`/grabber/projects/${id}/start`, { method: 'POST' }),
  stopGrabberProject: (id: string) => req<{ success: boolean }>(`/grabber/projects/${id}/stop`, { method: 'POST' }),
  deleteGrabberProject: (id: string) => req<{ success: boolean }>(`/grabber/projects/${id}`, { method: 'DELETE' }),

  // Storage maintenance
  scanMaintenance: () => req<MaintenanceScanResult>('/storage/maintenance'),
  cleanOrphanedFiles: (filePaths: string[]) =>
    req<{ cleaned: number; freedBytes: number }>('/storage/maintenance/clean', {
      method: 'POST',
      body: JSON.stringify({ filePaths }),
    }),

  // Clipboard
  checkClipboard: (text: string) =>
    req<{ isDownloadable: boolean; url?: string }>('/clipboard/check', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
