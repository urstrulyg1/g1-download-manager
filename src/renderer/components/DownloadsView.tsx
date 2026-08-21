import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Clock,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  MoreVertical,
  Shield,
  FileCheck,
  FolderOpen,
  Info,
  Layers,
  ArrowUpDown,
  ShieldAlert,
  Film,
} from 'lucide-react';
import { DownloadItem, DownloadQueue, CategoryRule } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';
import { MediaPreviewModal } from './MediaPreviewModal';

interface DownloadsViewProps {
  downloads: DownloadItem[];
  queues: DownloadQueue[];
  categories: CategoryRule[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (cat: string) => void;
  queueFilter: string;
  onQueueFilterChange: (q: string) => void;
  lang: Language;
  onSelectDownload: (item: DownloadItem) => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  downloads,
  queues,
  categories,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  queueFilter,
  onQueueFilterChange,
  lang,
  onSelectDownload,
}) => {
  const t = translations[lang] || translations.en;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<DownloadItem | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'filename' | 'size' | 'progress' | 'speed'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Filtered & Sorted downloads
  const filteredDownloads = useMemo(() => {
    return downloads
      .filter((item) => {
        // Status filter
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        // Category filter
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        // Queue filter
        if (queueFilter !== 'all' && item.queueId !== queueFilter) return false;
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = item.filename.toLowerCase().includes(q);
          const matchUrl = item.url.toLowerCase().includes(q);
          const matchCategory = item.category.toLowerCase().includes(q);
          const matchError = item.error?.message.toLowerCase().includes(q);
          if (!matchName && !matchUrl && !matchCategory && !matchError) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'createdAt') diff = a.createdAt - b.createdAt;
        if (sortBy === 'filename') diff = a.filename.localeCompare(b.filename);
        if (sortBy === 'size') diff = (a.totalBytes || 0) - (b.totalBytes || 0);
        if (sortBy === 'progress') diff = a.progress - b.progress;
        if (sortBy === 'speed') diff = a.speed - b.speed;
        return sortOrder === 'desc' ? -diff : diff;
      });
  }, [downloads, statusFilter, categoryFilter, queueFilter, searchQuery, sortBy, sortOrder]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredDownloads.map((d) => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Batch action handlers
  const handleBatchPause = () => {
    selectedIds.forEach((id) => api.pauseDownload(id));
  };

  const handleBatchResume = () => {
    selectedIds.forEach((id) => api.resumeDownload(id));
  };

  const handleBatchDelete = (deleteFiles: boolean) => {
    selectedIds.forEach((id) => api.deleteDownload(id, deleteFiles));
    setSelectedIds(new Set());
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)] flex flex-col">
      {/* Top Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters & Sorters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            {['all', 'downloading', 'queued', 'completed', 'paused', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => onStatusFilterChange(st)}
                className={`px-2.5 py-1 rounded-lg capitalize transition-colors ${
                  statusFilter === st ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Queue Dropdown */}
          <select
            value={queueFilter}
            onChange={(e) => onQueueFilterChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Queues</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Multi-Select Floating Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border border-blue-500/40 rounded-xl px-4 py-2.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
              {selectedIds.size}
            </span>
            <span>Items Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBatchResume}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Resume</span>
            </button>
            <button
              onClick={handleBatchPause}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm"
            >
              <Pause className="w-3 h-3 fill-white" />
              <span>Pause</span>
            </button>
            <button
              onClick={() => handleBatchDelete(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 border border-slate-700"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              <span>Remove Records</span>
            </button>
            <button
              onClick={() => handleBatchDelete(true)}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1 shadow-sm"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Files</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Downloads Table */}
      <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredDownloads.length > 0 && selectedIds.size === filteredDownloads.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-900 cursor-pointer"
                  />
                </th>
                <th className="p-3">Status</th>
                <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => { setSortBy('filename'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  <div className="flex items-center gap-1">
                    <span>File Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => { setSortBy('size'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  <div className="flex items-center gap-1">
                    <span>Size</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3 w-48 cursor-pointer hover:text-slate-200" onClick={() => { setSortBy('progress'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  <div className="flex items-center gap-1">
                    <span>Progress (Segments)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => { setSortBy('speed'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                  <div className="flex items-center gap-1">
                    <span>Speed / ETA</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredDownloads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-500">
                    No matching downloads found.
                  </td>
                </tr>
              ) : (
                filteredDownloads.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectDownload(item)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-950/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectOne(item.id, e as any)}
                          className="rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-900 cursor-pointer"
                        />
                      </td>

                      {/* Status */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {item.status === 'downloading' && (
                            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-[11px]">Active</span>
                            </div>
                          )}
                          {item.status === 'queued' && (
                            <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                              <Clock className="w-4 h-4" />
                              <span className="text-[11px]">Queued</span>
                            </div>
                          )}
                          {item.status === 'completed' && (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-[11px]">Done</span>
                            </div>
                          )}
                          {item.status === 'paused' && (
                            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                              <PauseCircle className="w-4 h-4" />
                              <span className="text-[11px]">Paused</span>
                            </div>
                          )}
                          {item.status === 'failed' && (
                            <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                              <XCircle className="w-4 h-4" />
                              <span className="text-[11px]">Failed</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* File Name & Domain */}
                      <td className="p-3 max-w-xs">
                        <div className="font-semibold text-slate-200 truncate group-hover:text-blue-400 flex items-center gap-1.5">
                          <span className="truncate">{item.filename}</span>
                          {item.safetyWarning && !item.safetyWarning.isSafe && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
                              title={`${item.safetyWarning.warningTitle}: ${item.safetyWarning.reasons.join(', ')}`}
                            >
                              <ShieldAlert className="w-3 h-3 text-rose-400" />
                              <span>Threat Warning</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                            {item.category}
                          </span>
                          <span className="truncate">{new URL(item.url).hostname}</span>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="p-3 whitespace-nowrap font-mono text-slate-300">
                        <div>{item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Stream'}</div>
                        <div className="text-[10px] text-slate-400">{formatBytes(item.downloadedBytes)}</div>
                      </td>

                      {/* Dynamic Segment Visualizer Progress Bar */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                            <span>{item.progress.toFixed(1)}%</span>
                            <span>{item.activeConnections} conn</span>
                          </div>

                          {/* Dynamic segments representation */}
                          {item.segments && item.segments.length > 1 ? (
                            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-slate-800">
                              {item.segments.map((seg) => {
                                const segTotal = seg.endOffset - seg.startOffset + 1;
                                const segPct = segTotal > 0 ? Math.min(100, (seg.downloadedBytes / segTotal) * 100) : 0;
                                return (
                                  <div
                                    key={seg.id}
                                    className="h-full bg-slate-800 rounded-sm overflow-hidden flex-1 relative"
                                    title={`Segment ${seg.id}: ${seg.status} (${segPct.toFixed(0)}%)`}
                                  >
                                    <div
                                      className={`h-full transition-all duration-200 ${
                                        seg.status === 'completed'
                                          ? 'bg-emerald-400'
                                          : seg.status === 'downloading'
                                          ? 'bg-cyan-400 animate-pulse'
                                          : 'bg-slate-700'
                                      }`}
                                      style={{ width: `${segPct}%` }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  item.status === 'completed'
                                    ? 'bg-emerald-400'
                                    : item.status === 'failed'
                                    ? 'bg-rose-400'
                                    : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                                }`}
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Speed / ETA */}
                      <td className="p-3 whitespace-nowrap font-mono">
                        {item.status === 'downloading' ? (
                          <>
                            <div className="text-cyan-400 font-semibold">{formatBytes(item.speed)}/s</div>
                            <div className="text-[10px] text-slate-400">ETA {item.eta}s</div>
                          </>
                        ) : item.status === 'completed' ? (
                          <div className="text-slate-400 text-[11px]">
                            Avg {formatBytes(item.avgSpeed)}/s
                          </div>
                        ) : item.status === 'failed' && item.error ? (
                          <div className="text-rose-400 text-[10px] truncate max-w-[120px]" title={item.error.message}>
                            {item.error.message}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {item.status === 'downloading' ? (
                            <button
                              onClick={() => api.pauseDownload(item.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 active:scale-95 transition-all shadow-sm"
                              title="Pause active download"
                              aria-label="Pause active download"
                            >
                              <Pause className="w-3.5 h-3.5 fill-amber-400" />
                            </button>
                          ) : item.status === 'paused' || item.status === 'failed' ? (
                            <button
                              onClick={() => api.resumeDownload(item.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 active:scale-95 transition-all shadow-sm"
                              title="Resume download immediately"
                              aria-label="Resume download immediately"
                            >
                              <Play className="w-3.5 h-3.5 fill-emerald-400" />
                            </button>
                          ) : null}

                          {/* Media Live Preview Button */}
                          {(item.category === 'video' || item.category === 'audio' || item.filename?.match(/\.(mp4|mkv|webm|mov|ts|mp3|flac|wav|m4a)$/i)) && (
                            <button
                              onClick={() => setPreviewItem(item)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 active:scale-95 transition-all shadow-sm"
                              title="Live Video Preview — Watch and seek buffered stream via HTTP 206"
                              aria-label="Live Video Preview"
                            >
                              <Film className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => api.restartDownload(item.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 transition-all shadow-sm"
                            title="Restart download from beginning (Reset chunks)"
                            aria-label="Restart download from beginning"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onSelectDownload(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 active:scale-95 transition-all shadow-sm"
                            title="Open Segment Visualizer, Logs & Details Inspector"
                            aria-label="Open Details Inspector"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => api.deleteDownload(item.id, false)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 active:scale-95 transition-all shadow-sm"
                            title="Remove download record from manager"
                            aria-label="Remove download record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-App Live Media Preview Player Modal */}
      <MediaPreviewModal
        item={previewItem}
        isOpen={!!previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
};
