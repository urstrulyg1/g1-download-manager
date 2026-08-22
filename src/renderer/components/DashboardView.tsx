import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Flame,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Pause,
  PauseCircle,
  Play,
  Plus,
  ShieldCheck,
  TrendingUp,
  XCircle,
  Zap,
  FolderOpen,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { DownloadItem, SystemMetrics, CategoryRule } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { ActiveView } from './Sidebar';
import { api } from '../lib/api';

interface DashboardViewProps {
  downloads: DownloadItem[];
  metrics: SystemMetrics | null;
  categories: CategoryRule[];
  lang: Language;
  onNavigate: (view: ActiveView, statusFilter?: string) => void;
  onOpenNewDownload: () => void;
  onSelectDownload: (item: DownloadItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  downloads,
  metrics,
  categories,
  lang,
  onNavigate,
  onOpenNewDownload,
  onSelectDownload,
}) => {
  const t = translations[lang] || translations.en;
  const [speedHistory, setSpeedHistory] = useState<number[]>(new Array(40).fill(0));

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Aggregate stats
  const activeDownloads = downloads.filter((d) => d.status === 'downloading');
  const queuedDownloads = downloads.filter((d) => d.status === 'queued');
  const completedDownloads = downloads.filter((d) => d.status === 'completed');
  const pausedDownloads = downloads.filter((d) => d.status === 'paused');
  const failedDownloads = downloads.filter((d) => d.status === 'failed');

  const currentSpeed = activeDownloads.reduce((sum, d) => sum + d.speed, 0);
  const totalDownloadedBytes = downloads.reduce((sum, d) => sum + d.downloadedBytes, 0);
  const totalConnections = activeDownloads.reduce((sum, d) => sum + d.activeConnections, 0);

  // Update rolling speed graph
  useEffect(() => {
    setSpeedHistory((prev) => [...prev.slice(1), currentSpeed]);
  }, [currentSpeed]);

  const maxSpeed = Math.max(...speedHistory, 1024 * 1024); // at least 1MB scale

  // SVG Chart path calculation
  const chartHeight = 120;
  const chartWidth = 600;
  const points = speedHistory.map((val, idx) => {
    const x = (idx / (speedHistory.length - 1)) * chartWidth;
    const y = chartHeight - (val / maxSpeed) * (chartHeight - 20) - 10;
    return `${x},${y}`;
  });

  const svgPath = points.length > 0 ? `M ${points.join(' L ')}` : '';
  const areaPath =
    points.length > 0 ? `M 0,${chartHeight} L ${points.join(' L ')} L ${chartWidth},${chartHeight} Z` : '';

  // Category distribution
  const categoryBytes: Record<string, number> = {};
  for (const item of downloads) {
    categoryBytes[item.category] = (categoryBytes[item.category] || 0) + item.downloadedBytes;
  }

  return (
    <div className="p-6 pt-10 pb-12 space-y-6 max-w-7xl mx-auto w-full">
      {/* Hero Speed & Throughput Live Monitor Card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 p-6 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
              <Zap className="w-4 h-4 fill-cyan-400" />
              <span>Real-Time Engine Throughput</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
                {formatBytes(currentSpeed)}
                <span className="text-xl text-slate-400 font-sans font-medium">/s</span>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                {activeDownloads.length} Active Stream{activeDownloads.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-6 text-xs bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5">
            <div>
              <div className="text-slate-400 font-medium">Active Sockets</div>
              <div className="text-lg font-bold text-white font-mono">{totalConnections}</div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <div className="text-slate-400 font-medium">Peak Rate</div>
              <div className="text-lg font-bold text-cyan-300 font-mono">
                {formatBytes(Math.max(...downloads.map((d) => d.peakSpeed), currentSpeed))}/s
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <div className="text-slate-400 font-medium">Total Downloaded</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {formatBytes(totalDownloadedBytes)}
              </div>
            </div>
          </div>
        </div>

        {/* Real-time SVG Bandwidth Graph */}
        <div className="w-full relative bg-slate-950/80 rounded-xl p-4 border border-slate-800/60 shadow-inner flex flex-col gap-2">
          <div className="w-full h-32 relative">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="speedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Grid lines */}
              <line x1="0" y1="25" x2={chartWidth} y2="25" stroke="#334155" strokeDasharray="4 4" strokeWidth="0.5" opacity="0.6" />
              <line x1="0" y1="55" x2={chartWidth} y2="55" stroke="#334155" strokeDasharray="4 4" strokeWidth="0.5" opacity="0.6" />
              <line x1="0" y1="85" x2={chartWidth} y2="85" stroke="#334155" strokeDasharray="4 4" strokeWidth="0.5" opacity="0.6" />

              {/* Filled area */}
              <path d={areaPath} fill="url(#speedGrad)" />
              {/* Line */}
              <path d={svgPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          <div className="flex items-center justify-between pt-2 px-1 text-[11px] text-slate-400 font-mono border-t border-slate-800/50">
            <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Dynamic Work-Stealing 2.0
            </span>
            <span>Last 60 Seconds Throughput</span>
          </div>
        </div>
      </div>

      {/* 5 Interactive Metric Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Downloading */}
        <button
          onClick={() => onNavigate('downloads', 'downloading')}
          className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 shadow-lg shadow-cyan-500/10 hover:shadow-xl hover:shadow-cyan-500/25 transition-all duration-200 text-left group active:scale-95"
        >
          <div className="flex items-center justify-between text-cyan-400 mb-2">
            <Loader2 className={`w-5 h-5 ${activeDownloads.length > 0 ? 'animate-spin' : ''}`} />
            <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{activeDownloads.length}</div>
          <div className="text-xs font-semibold text-slate-400">Downloading</div>
        </button>

        {/* Queued */}
        <button
          onClick={() => onNavigate('downloads', 'queued')}
          className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-purple-500/50 shadow-lg shadow-purple-500/10 hover:shadow-xl hover:shadow-purple-500/25 transition-all duration-200 text-left group active:scale-95"
        >
          <div className="flex items-center justify-between text-purple-400 mb-2">
            <Clock className="w-5 h-5" />
            <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{queuedDownloads.length}</div>
          <div className="text-xs font-semibold text-slate-400">In Queue</div>
        </button>

        {/* Completed */}
        <button
          onClick={() => onNavigate('downloads', 'completed')}
          className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 shadow-lg shadow-emerald-500/10 hover:shadow-xl hover:shadow-emerald-500/25 transition-all duration-200 text-left group active:scale-95"
        >
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <CheckCircle2 className="w-5 h-5" />
            <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{completedDownloads.length}</div>
          <div className="text-xs font-semibold text-slate-400">Completed</div>
        </button>

        {/* Paused */}
        <button
          onClick={() => onNavigate('downloads', 'paused')}
          className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 shadow-lg shadow-amber-500/10 hover:shadow-xl hover:shadow-amber-500/25 transition-all duration-200 text-left group active:scale-95"
        >
          <div className="flex items-center justify-between text-amber-400 mb-2">
            <PauseCircle className="w-5 h-5" />
            <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{pausedDownloads.length}</div>
          <div className="text-xs font-semibold text-slate-400">Paused</div>
        </button>

        {/* Failed */}
        <button
          onClick={() => onNavigate('downloads', 'failed')}
          className="p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-rose-500/50 shadow-lg shadow-rose-500/10 hover:shadow-xl hover:shadow-rose-500/25 transition-all duration-200 text-left group col-span-2 sm:col-span-1 active:scale-95"
        >
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <XCircle className="w-5 h-5" />
            <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{failedDownloads.length}</div>
          <div className="text-xs font-semibold text-slate-400">Failed</div>
        </button>
      </div>

      {/* Power Action Cards */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Quick Workflows
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={onOpenNewDownload}
            className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/50 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-200 text-left group active:scale-95"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                New Download
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                HTTP, HTTPS, FTP, FTPS, and HLS streaming
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('batchLinks')}
            className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/50 shadow-md shadow-cyan-500/10 hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-200 text-left group active:scale-95"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20 group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                Batch Link Extractor
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Download all links and assets from webpage
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('mediaDetector')}
            className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/50 shadow-md shadow-amber-500/10 hover:shadow-lg hover:shadow-amber-500/25 transition-all duration-200 text-left group active:scale-95"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 group-hover:scale-105 transition-transform">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                Media Sniffer
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Detect video and audio streams dynamically
              </div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('siteGrabber')}
            className="flex items-start gap-3.5 p-4 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 shadow-md shadow-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/25 transition-all duration-200 text-left group active:scale-95"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                Site Grabber
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Recursive website asset mirror & downloader
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Downloads Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">Recent Download Tasks</h3>
          </div>
          <button
            onClick={() => onNavigate('downloads')}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors duration-150"
          >
            <span>View All ({downloads.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {downloads.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No downloads yet. Click "New Download" to start downloading real files.
          </div>
        ) : (
          <div className="space-y-2">
            {downloads.slice(0, 5).map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectDownload(item)}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800/80 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.status === 'downloading'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : item.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : item.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.status === 'downloading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : item.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : item.status === 'failed' ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <PauseCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-blue-400 transition-colors">
                      {item.filename}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{item.category.toUpperCase()}</span>
                      <span>•</span>
                      <span>{formatBytes(item.downloadedBytes)} / {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Stream'}</span>
                      {item.speed > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-400 font-mono font-medium">{formatBytes(item.speed)}/s</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="w-32 hidden sm:block">
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <span>{item.progress.toFixed(1)}%</span>
                      {item.eta > 0 && <span>ETA {item.eta}s</span>}
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.status === 'completed'
                            ? 'bg-emerald-400'
                            : item.status === 'failed'
                            ? 'bg-rose-400'
                            : 'bg-cyan-400'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {item.status === 'downloading' ? (
                      <button
                        onClick={() => api.pauseDownload(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 shadow-sm transition-all duration-200 active:scale-95"
                        title="Pause"
                      >
                        <Pause className="w-3.5 h-3.5 fill-amber-400" />
                      </button>
                    ) : item.status === 'paused' || item.status === 'failed' ? (
                      <button
                        onClick={() => api.resumeDownload(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 shadow-sm transition-all duration-200 active:scale-95"
                        title="Resume"
                      >
                        <Play className="w-3.5 h-3.5 fill-emerald-400" />
                      </button>
                    ) : item.status === 'completed' ? (
                      <button
                        onClick={() => api.openFolder(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-950 text-blue-400 hover:text-blue-300 shadow-sm transition-all duration-200 active:scale-95"
                        title="Show in Folder"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    ) : null}

                    <button
                      onClick={() => api.deleteDownload(item.id, false)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 shadow-sm transition-all duration-200 active:scale-95"
                      title="Remove record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
