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
  Zap,
  ExternalLink,
  Copy,
  Check,
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
  onOpenIdmProgress?: (item: DownloadItem) => void;
  onRefresh?: () => void;
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
  onOpenIdmProgress,
  onRefresh,
}) => {
  const t = translations[lang] || translations.en;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<DownloadItem | null>(null);
  const [sortBy, setSortBy] = useState<'createdAt' | 'filename' | 'size' | 'progress' | 'speed'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('ftp://'))) {
      try {
        await api.addDownload({ url: text.trim(), startImmediately: true });
        if (onRefresh) onRefresh();
      } catch (err: any) {
        alert(`Failed to add download: ${err.message}`);
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

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

  const totalPages = Math.ceil(filteredDownloads.length / (pageSize || 50)) || 1;
  const paginatedDownloads = useMemo(() => {
    if (pageSize <= 0) return filteredDownloads;
    const start = (currentPage - 1) * pageSize;
    return filteredDownloads.slice(start, start + pageSize);
  }, [filteredDownloads, currentPage, pageSize]);

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

  const handleBatchDelete = async (deleteFiles: boolean) => {
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => api.deleteDownload(id, deleteFiles).catch(console.error)));
    if (onRefresh) onRefresh();
  };

  const handleCopyUrl = (id: string, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  const handleCyclePriority = async (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const priorities = ['low', 'normal', 'high', 'urgent'];
    const currentIdx = priorities.indexOf(item.priority || 'normal');
    const nextPriority = priorities[(currentIdx + 1) % priorities.length];
    await api.updatePriority(item.id, nextPriority).catch(console.error);
    if (onRefresh) onRefresh();
  };

  const failedCount = downloads.filter((d) => d.status === 'failed').length;
  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const activeCount = downloads.filter((d) => d.status === 'downloading').length;
  const queuedCount = downloads.filter((d) => d.status === 'queued').length;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative p-6 space-y-4 max-w-7xl mx-auto w-full flex flex-col"
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-blue-950/90 border-2 border-dashed border-blue-400 rounded-3xl flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-150">
          <Download className="w-16 h-16 text-blue-400 mb-4 animate-bounce" />
          <h3 className="text-xl font-bold text-white mb-2">Drop Link to Download</h3>
          <p className="text-sm text-blue-200">Release link or URL anywhere to start downloading immediately</p>
        </div>
      )}

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

      {/* Global Quick Action Bar */}
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap text-xs">
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <span>{filteredDownloads.length} item{filteredDownloads.length === 1 ? '' : 's'} displayed</span>
          {activeCount > 0 && <span className="text-cyan-400">({activeCount} downloading)</span>}
        </div>

        <div className="flex items-center gap-2">
          {queuedCount > 0 && (
            <button
              onClick={() => { api.startAll().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 flex items-center gap-1.5 font-semibold transition-colors"
              title="Start all queued downloads"
            >
              <Play className="w-3.5 h-3.5 fill-blue-300" />
              <span>Start All</span>
            </button>
          )}

          {activeCount > 0 ? (
            <button
              onClick={() => { api.pauseAll().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1.5 font-semibold transition-colors"
              title="Pause all active transfers"
            >
              <Pause className="w-3.5 h-3.5 fill-amber-300" />
              <span>Pause All</span>
            </button>
          ) : (
            <button
              onClick={() => { api.resumeAll().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5 font-semibold transition-colors"
              title="Resume all paused and failed downloads"
            >
              <Play className="w-3.5 h-3.5 fill-emerald-300" />
              <span>Resume All</span>
            </button>
          )}

          {activeCount > 0 && (
            <button
              onClick={() => { api.cancelAll().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 flex items-center gap-1.5 font-semibold transition-colors"
              title="Cancel all active and queued downloads"
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Cancel All</span>
            </button>
          )}

          {failedCount > 0 && (
            <button
              onClick={() => { api.retryFailed().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 font-semibold transition-colors"
              title="Retry all failed downloads"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry {failedCount} Failed</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={() => { api.clearCompleted().then(onRefresh).catch(console.error); }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 flex items-center gap-1.5 font-semibold transition-colors"
              title="Clear completed download entries"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Done</span>
            </button>
          )}
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
                  <td colSpan={7} className="py-20 text-center text-slate-400" data-testid="downloads-empty-state">
                    <div className="max-w-sm mx-auto flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 shadow-inner">
                        {statusFilter === 'failed' ? (
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        ) : searchQuery ? (
                          <Search className="w-6 h-6 text-slate-400" />
                        ) : (
                          <Download className="w-6 h-6 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">
                          {statusFilter === 'failed'
                            ? 'No Failed Downloads'
                            : searchQuery
                            ? `No results for "${searchQuery}"`
                            : statusFilter !== 'all'
                            ? `No ${statusFilter} downloads`
                            : 'No downloads yet'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {statusFilter === 'failed'
                            ? 'All queued and active transfers have completed successfully.'
                            : searchQuery
                            ? 'Check the spelling or try searching for another term.'
                            : statusFilter !== 'all'
                            ? `Switch filters to view active, queued, or completed downloads.`
                            : 'Click "Add Download" in the navbar or paste any link to start.'}
                        </p>
                      </div>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                        >
                          Clear Search
                        </button>
                      )}
                      {!searchQuery && statusFilter !== 'all' && (
                        <button
                          onClick={() => onStatusFilterChange('all')}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                        >
                          View All Downloads
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedDownloads.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      data-testid={`download-row-${item.id}`}
                      data-download-id={item.id}
                      onClick={() => onSelectDownload(item)}
                      onDoubleClick={() => {
                        if (onOpenIdmProgress) {
                          onOpenIdmProgress(item);
                        } else {
                          onSelectDownload(item);
                        }
                      }}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors select-none ${
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
                          {item.status === 'cancelled' && (
                            <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
                              <XCircle className="w-4 h-4" />
                              <span className="text-[11px]">Cancelled</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* File Name & Domain */}
                      <td className="p-3 max-w-xs">
                        <div className="font-semibold text-slate-200 truncate group-hover:text-blue-400 flex items-center gap-1.5">
                          <span className="truncate" data-testid={`download-filename-${item.id}`}>{item.filename}</span>
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
                          <button
                            type="button"
                            onClick={(e) => handleCyclePriority(item, e)}
                            className={`px-1.5 py-0.2 rounded font-mono text-[10px] uppercase font-bold border transition-colors ${
                              item.priority === 'urgent'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : item.priority === 'high'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : item.priority === 'low'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}
                            title="Click to cycle priority (Urgent / High / Normal / Low)"
                            aria-label={`Priority: ${item.priority || 'normal'}. Click to cycle.`}
                          >
                            {item.priority || 'normal'}
                          </button>
                          <span className="truncate">{new URL(item.url).hostname}</span>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="p-3 whitespace-nowrap font-mono text-slate-300">
                        <div>{item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Stream'}</div>
                        <div className="text-[10px] text-slate-400">{formatBytes(item.downloadedBytes)}</div>
                      </td>

                      {/* Dynamic Segment Visualizer Progress Bar (Click to open IDM dialogue) */}
                      <td
                        className="p-3 cursor-pointer"
                        onClick={(e) => {
                          if (onOpenIdmProgress) {
                            e.stopPropagation();
                            onOpenIdmProgress(item);
                          }
                        }}
                        title="Click to open IDM-Style Live Progress Dialogue"
                      >
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                            <span className="text-cyan-400 font-semibold">{item.progress.toFixed(1)}%</span>
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
                                    className="h-full bg-slate-800 rounded-sm overflow-hidden flex-1 relative segment-cell"
                                    title={`Segment ${seg.id}: ${seg.status} (${segPct.toFixed(0)}%)`}
                                  >
                                    <div
                                      className={`h-full transition-all duration-200 smooth-progress-bar ${
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
                                className={`h-full rounded-full transition-all duration-300 smooth-progress-bar ${
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
                          ) : item.status === 'completed' ? (
                            <>
                              <button
                                onClick={() => api.openFile(item.id).catch(console.error)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-400 hover:text-emerald-300 active:scale-95 transition-all shadow-sm"
                                title="Open / Launch File"
                                aria-label="Open File"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => api.openFolder(item.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-950 text-blue-400 hover:text-blue-300 active:scale-95 transition-all shadow-sm"
                                title="Show in Folder"
                                aria-label="Show in Folder"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : null}

                          {/* Copy URL button */}
                          <button
                            onClick={(e) => handleCopyUrl(item.id, item.url, e)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 active:scale-95 transition-all shadow-sm"
                            title={copiedId === item.id ? 'Copied URL!' : 'Copy download URL'}
                            aria-label="Copy download URL"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

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

                          {/* IDM Progress Dialogue Box Button */}
                          {onOpenIdmProgress && (
                            <button
                              onClick={() => onOpenIdmProgress(item)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 active:scale-95 transition-all shadow-sm"
                              title="Open IDM-Style Live Progress Dialogue Box"
                              aria-label="Open IDM Progress Dialogue"
                              data-testid={`open-idm-progress-${item.id}`}
                            >
                              <Zap className="w-3.5 h-3.5 fill-cyan-400" />
                            </button>
                          )}

                          <button
                            onClick={() => onSelectDownload(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 active:scale-95 transition-all shadow-sm"
                            title="Open Segment Visualizer, Logs & Details Inspector"
                            aria-label="Open Details Inspector"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await api.deleteDownload(item.id, false).catch(console.error);
                              if (onRefresh) onRefresh();
                            }}
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

        {/* Pagination & Results Counter */}
        {filteredDownloads.length > 0 && (
          <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span>Showing {Math.min(filteredDownloads.length, (currentPage - 1) * pageSize + 1)} - {Math.min(filteredDownloads.length, currentPage * pageSize)} of {filteredDownloads.length}</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 focus:outline-none"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={250}>250 / page</option>
                <option value={1000}>1000 / page</option>
              </select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                >
                  Prev
                </button>
                <span className="px-2 font-mono">{currentPage} / {totalPages}</span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
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
