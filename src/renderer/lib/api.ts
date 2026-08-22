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

async function req<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {}
    throw new Error(errMsg);
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
  stopAll: () => req<{ success: boolean }>('/downloads/stop-all', { method: 'POST' }),
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
