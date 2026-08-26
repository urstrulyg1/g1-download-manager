import React from 'react';
import {
  LayoutDashboard,
  Download,
  ListOrdered,
  Globe,
  Layers,
  Video,
  Activity,
  HardDrive,
  Settings,
  Folder,
  Music,
  FileText,
  Image,
  Archive,
  Terminal,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
  Loader2,
  Flame,
  ShieldCheck,
  BarChart3,
  Camera,
  AlertOctagon,
  Sparkles,
  Zap,
} from 'lucide-react';
import { DownloadItem, DownloadQueue, CategoryRule, SystemMetrics } from '../../shared/types';
import { Language, translations } from '../lib/i18n';

export type ActiveView =
  | 'dashboard'
  | 'downloads'
  | 'inbox'
  | 'mediaLibrary'
  | 'queues'
  | 'siteGrabber'
  | 'batchLinks'
  | 'mediaDetector'
  | 'automation'
  | 'powerFeatures'
  | 'analytics'
  | 'incidents'
  | 'snapshots'
  | 'compatibility'
  | 'diagnostics'
  | 'storageMaintenance'
  | 'settings';

interface SidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (cat: string) => void;
  queueFilter: string;
  onQueueFilterChange: (queue: string) => void;
  downloads: DownloadItem[];
  queues: DownloadQueue[];
  categories: CategoryRule[];
  metrics: SystemMetrics | null;
  lang: Language;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  queueFilter,
  onQueueFilterChange,
  downloads,
  queues,
  categories,
  metrics,
  lang,
}) => {
  const t = translations[lang] || translations.en;

  const counts = React.useMemo(() => ({
    all: downloads.length,
    downloading: downloads.filter((d) => d.status === 'downloading').length,
    queued: downloads.filter((d) => d.status === 'queued').length,
    completed: downloads.filter((d) => d.status === 'completed').length,
    paused: downloads.filter((d) => d.status === 'paused').length,
    failed: downloads.filter((d) => d.status === 'failed').length,
  }), [downloads]);

  const catCounts = React.useMemo(() => {
    const acc: Record<string, number> = {};
    for (const item of downloads) {
      acc[item.category] = (acc[item.category] || 0) + 1;
    }
    return acc;
  }, [downloads]);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <aside className="w-64 shrink-0 bg-slate-900/95 dark:bg-slate-950/95 border-r border-slate-800 flex flex-col justify-between select-none h-full overflow-y-auto">
      <div className="p-3 space-y-6">
        {/* Main Navigation */}
        <div className="space-y-1">
          <button
            onClick={() => {
              onViewChange('dashboard');
              onStatusFilterChange('all');
              onCategoryFilterChange('all');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeView === 'dashboard'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-md hover:shadow-blue-500/20'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4" />
              <span>{t.dashboard}</span>
            </div>
            {counts.downloading > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-bold animate-pulse">
                {counts.downloading}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onViewChange('inbox');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeView === 'inbox'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-md hover:shadow-indigo-500/20'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Folder className="w-4 h-4 text-indigo-400" />
              <span>Download Inbox</span>
            </div>
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
              Stage
            </span>
          </button>
          <button
            onClick={() => {
              onViewChange('downloads');
              onStatusFilterChange('all');
              onCategoryFilterChange('all');
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              activeView === 'downloads' && statusFilter === 'all' && categoryFilter === 'all' && queueFilter === 'all'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-md hover:shadow-blue-500/20'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4" />
              <span>{t.downloads}</span>
            </div>
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
              {counts.all}
            </span>
          </button>
        </div>

        {/* Status Filters */}
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Status
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => {
                onViewChange('downloads');
                onStatusFilterChange('downloading');
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeView === 'downloads' && statusFilter === 'downloading'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-cyan-500/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <Loader2 className={`w-3.5 h-3.5 text-cyan-400 ${counts.downloading > 0 ? 'animate-spin' : ''}`} />
                <span>Downloading</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 font-semibold">{counts.downloading}</span>
            </button>

            <button
              onClick={() => {
                onViewChange('downloads');
                onStatusFilterChange('queued');
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeView === 'downloads' && statusFilter === 'queued'
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-sm shadow-purple-500/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-purple-500/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Queued</span>
              </div>
              <span className="text-[10px] font-mono text-purple-400 font-semibold">{counts.queued}</span>
            </button>

            <button
              onClick={() => {
                onViewChange('downloads');
                onStatusFilterChange('completed');
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeView === 'downloads' && statusFilter === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-emerald-500/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Completed</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold">{counts.completed}</span>
            </button>

            <button
              onClick={() => {
                onViewChange('downloads');
                onStatusFilterChange('paused');
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeView === 'downloads' && statusFilter === 'paused'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-amber-500/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Paused</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 font-semibold">{counts.paused}</span>
            </button>

            <button
              onClick={() => {
                onViewChange('downloads');
                onStatusFilterChange('failed');
              }}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                activeView === 'downloads' && statusFilter === 'failed'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm shadow-rose-500/20'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-rose-500/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Failed</span>
              </div>
              <span className="text-[10px] font-mono text-rose-400 font-semibold">{counts.failed}</span>
            </button>
          </div>
        </div>

        {/* Categories */}
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Categories
          </div>
          <div className="space-y-0.5">
            {[
              { id: 'video', name: 'Videos', icon: Video, color: 'text-red-400' },
              { id: 'audio', name: 'Audio', icon: Music, color: 'text-purple-400' },
              { id: 'document', name: 'Documents', icon: FileText, color: 'text-blue-400' },
              { id: 'image', name: 'Images', icon: Image, color: 'text-emerald-400' },
              { id: 'archive', name: 'Compressed', icon: Archive, color: 'text-amber-400' },
              { id: 'program', name: 'Programs', icon: Terminal, color: 'text-pink-400' },
            ].map((cat) => {
              const IconComponent = cat.icon;
              const count = catCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    onViewChange('downloads');
                    onCategoryFilterChange(cat.id);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    activeView === 'downloads' && categoryFilter === cat.id
                      ? 'bg-slate-800 text-slate-100 font-bold shadow-sm shadow-slate-500/20'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:shadow-sm hover:shadow-slate-500/15'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent className={`w-3.5 h-3.5 ${cat.color}`} />
                    <span>{cat.name}</span>
                  </div>
                  {count > 0 && <span className="text-[10px] font-mono text-slate-400">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Next-Gen Power Tools */}
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Power Tools
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => onViewChange('powerFeatures')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeView === 'powerFeatures'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/40'
                  : 'text-amber-400 hover:bg-slate-800 hover:text-amber-300 hover:shadow-md hover:shadow-amber-500/20'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Superpowers Suite</span>
            </button>

            <button
              onClick={() => onViewChange('queues')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'queues'
                  ? 'bg-blue-600 text-white shadow-md shadow-indigo-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-indigo-500/20'
              }`}
            >
              <ListOrdered className="w-4 h-4 text-indigo-400" />
              <span>{t.queues}</span>
            </button>

            <button
              onClick={() => onViewChange('siteGrabber')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'siteGrabber'
                  ? 'bg-blue-600 text-white shadow-md shadow-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-emerald-500/20'
              }`}
            >
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>{t.siteGrabber}</span>
            </button>

            <button
              onClick={() => onViewChange('batchLinks')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'batchLinks'
                  ? 'bg-blue-600 text-white shadow-md shadow-cyan-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-cyan-500/20'
              }`}
            >
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>{t.batchLinks}</span>
            </button>

            <button
              onClick={() => onViewChange('mediaDetector')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'mediaDetector'
                  ? 'bg-blue-600 text-white shadow-md shadow-amber-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-amber-500/20'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-400" />
              <span>{t.mediaDetector}</span>
            </button>

            <button
              onClick={() => onViewChange('mediaLibrary')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'mediaLibrary'
                  ? 'bg-blue-600 text-white shadow-md shadow-amber-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-amber-500/20'
              }`}
            >
              <Video className="w-4 h-4 text-amber-400" />
              <span>Media Library</span>
            </button>

            <button
              onClick={() => onViewChange('automation')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'automation'
                  ? 'bg-blue-600 text-white shadow-md shadow-indigo-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-indigo-500/20'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Rule Automation</span>
            </button>

            <button
              onClick={() => onViewChange('analytics')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'analytics'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-blue-500/20'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span>Local Analytics</span>
            </button>

            <button
              onClick={() => onViewChange('incidents')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'incidents'
                  ? 'bg-blue-600 text-white shadow-md shadow-rose-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-rose-500/20'
              }`}
            >
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>Incident Console</span>
            </button>

            <button
              onClick={() => onViewChange('snapshots')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'snapshots'
                  ? 'bg-blue-600 text-white shadow-md shadow-cyan-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-cyan-500/20'
              }`}
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>Snapshots & Backups</span>
            </button>

            <button
              onClick={() => onViewChange('diagnostics')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'diagnostics'
                  ? 'bg-blue-600 text-white shadow-md shadow-rose-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-rose-500/20'
              }`}
            >
              <Activity className="w-4 h-4 text-rose-400" />
              <span>{t.diagnostics}</span>
            </button>

            <button
              onClick={() => onViewChange('compatibility')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'compatibility'
                  ? 'bg-blue-600 text-white shadow-md shadow-cyan-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-cyan-500/20'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Compatibility & Self-Healing</span>
            </button>

            <button
              onClick={() => onViewChange('storageMaintenance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'storageMaintenance'
                  ? 'bg-blue-600 text-white shadow-md shadow-teal-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-teal-500/20'
              }`}
            >
              <HardDrive className="w-4 h-4 text-teal-400" />
              <span>{t.storageMaintenance}</span>
            </button>

            <button
              onClick={() => onViewChange('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeView === 'settings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-sm hover:shadow-slate-500/20'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>{t.settings}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Footer: Bandwidth & Storage Gauges */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-3">
        {/* Real-time Bandwidth Mini Bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
            <span>Network Throughput</span>
            <span className="text-cyan-400 font-mono">
              {metrics ? formatBytes(metrics.network.activeDownloadSpeed) + '/s' : '0 B/s'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  ((metrics?.network.activeDownloadSpeed || 0) / (10 * 1024 * 1024)) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Disk Space Meter */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-1">
            <span>Disk Space</span>
            <span className="text-slate-300 font-mono">
              {metrics ? formatBytes(metrics.storage.freeBytes) + ' Free' : 'N/A'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  (((metrics?.storage.usedBytes || 1) / (metrics?.storage.totalBytes || 1)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
