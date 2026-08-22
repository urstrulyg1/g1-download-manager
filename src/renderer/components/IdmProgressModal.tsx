import React from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  FolderOpen,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Activity,
  Layers,
  FileVideo,
  FileAudio,
  HardDrive,
  Minus,
} from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { api } from '../lib/api';

interface IdmProgressModalProps {
  item: DownloadItem | null;
  onClose: () => void;
  onMinimize?: () => void;
}

export const IdmProgressModal: React.FC<IdmProgressModalProps> = ({
  item,
  onClose,
  onMinimize,
}) => {
  if (!item) return null;

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatEta = (seconds: number) => {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'Calculating...';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} remaining`;
  };

  const isCompleted = item.status === 'completed';
  const isFailed = item.status === 'failed';
  const isPaused = item.status === 'paused';
  const isCancelled = item.status === 'cancelled';
  const isDownloading = item.status === 'downloading';

  const phase = (item as any).phase || (isCompleted ? 'completed' : isDownloading ? 'downloading' : item.status);
  const isMerging = phase === 'merging';
  const isVerifying = phase === 'verifying';
  const statusMessage = (item as any).statusMessage;

  const metadata = (item as any).mediaMetadata || {};
  const displayTitle = metadata.title || item.filename;
  const qualityBadge = metadata.resolution || (item.filename.match(/(4320p|2160p|1440p|1080p|720p|480p|360p|8K|4K|2K)/i)?.[0]) || 'HD';
  const codecBadge = metadata.codec || (item.filename.match(/(HEVC|AV1|VP9|H\.264|AVC|AAC|OPUS|MP3)/i)?.[0]) || 'Video';
  const containerBadge = (metadata.container || item.filename.split('.').pop() || 'MP4').toUpperCase();
  const thumbnailUrl = (item as any).thumbnailUrl;

  const handlePauseResume = () => {
    if (isDownloading) {
      api.pauseDownload(item.id);
    } else {
      api.resumeDownload(item.id);
    }
  };

  const handleCancel = () => {
    api.cancelDownload(item.id);
  };

  const handleRetry = () => {
    api.resumeDownload(item.id);
  };

  const handleOpenFile = () => {
    api.openFile(item.id).catch((err) => {
      console.warn('Failed to open file via native host:', err);
    });
  };

  const handleOpenFolder = () => {
    api.openFolder(item.id).catch((err) => {
      console.warn('Failed to open folder via native host:', err);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl shadow-blue-950/40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Window Bar (IDM Style) */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Zap className="w-3.5 h-3.5 fill-white" />
            </div>
            <span className="text-xs font-extrabold tracking-wide text-white uppercase">
              {isCompleted
                ? 'Download Complete'
                : isMerging
                ? 'Multiplexing Media'
                : isVerifying
                ? 'Verifying Container'
                : isPaused
                ? 'Download Paused'
                : isFailed
                ? 'Download Failed'
                : 'Downloading Video'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                onClick={onMinimize}
                title="Minimize dialog"
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close window"
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dialog Body */}
        <div className="p-5 space-y-4">
          {/* Video Metadata Header Card */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center gap-3.5">
            {thumbnailUrl ? (
              <div className="w-20 h-14 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 shrink-0 relative shadow-md">
                <img src={thumbnailUrl} alt={displayTitle} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 right-1 px-1 rounded bg-slate-950/80 text-[9px] font-mono font-bold text-cyan-300">
                  {qualityBadge}
                </div>
              </div>
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-blue-500/20 to-cyan-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                {item.category === 'audio' ? <FileAudio className="w-7 h-7" /> : <FileVideo className="w-7 h-7" />}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-sm font-bold text-white truncate" title={displayTitle}>
                {displayTitle}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold text-[10px]">
                  {qualityBadge}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold text-[10px]">
                  {codecBadge}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-[10px]">
                  {containerBadge}
                </span>
              </div>
            </div>
          </div>

          {/* Size & Percentage Banner */}
          <div className="flex items-baseline justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="font-bold text-white text-sm">
                {formatBytes(item.downloadedBytes)}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">
                {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Dynamic Stream'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isMerging ? (
                <span className="text-purple-400 font-bold animate-pulse">MUXING AUDIO + VIDEO</span>
              ) : isVerifying ? (
                <span className="text-amber-400 font-bold animate-pulse">VERIFYING CONTAINER</span>
              ) : (
                <span className="text-cyan-400 font-extrabold text-base">
                  {item.progress ? item.progress.toFixed(1) : (isCompleted ? '100.0' : '0.0')}%
                </span>
              )}
            </div>
          </div>

          {/* IDM Segmented Progress Bar */}
          <div className="w-full bg-slate-950 rounded-xl p-1 border border-slate-800 shadow-inner">
            <div className="h-3 w-full bg-slate-900 rounded-lg overflow-hidden relative">
              <div
                className={`h-full transition-all duration-200 rounded-lg ${
                  isCompleted
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : isFailed
                    ? 'bg-rose-600'
                    : isPaused
                    ? 'bg-amber-500'
                    : isMerging
                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400 animate-pulse'
                    : isVerifying
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 animate-pulse'
                    : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-500'
                }`}
                style={{
                  width: `${isCompleted ? 100 : Math.max(item.progress || 0, isDownloading ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>

          {/* Status Message or Error if present */}
          {statusMessage && !isFailed && !isCompleted && (
            <div className="text-[11px] font-mono text-cyan-300/90 flex items-center gap-1.5 px-2">
              <Activity className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {isFailed && item.error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-rose-200 block">Download Error</span>
                <span className="font-mono text-[11px]">{item.error.message}</span>
              </div>
            </div>
          )}

          {/* Transfer Telemetry Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Current Speed</span>
              <span className="font-bold text-emerald-400 text-xs">
                {item.speed > 0 ? `↓ ${formatBytes(item.speed)}/s` : '0 B/s'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Time Remaining</span>
              <span className="font-bold text-slate-200 text-xs">
                {isCompleted ? 'Done' : item.speed > 0 ? formatEta(item.eta) : 'Paused'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Connections</span>
              <span className="font-bold text-cyan-400 text-xs">
                {item.activeConnections || (isDownloading ? 8 : 0)} streams
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <span className="text-[10px] text-slate-500 uppercase block mb-0.5">Average Speed</span>
              <span className="font-bold text-slate-300 text-xs">
                {item.avgSpeed > 0 ? `${formatBytes(item.avgSpeed)}/s` : '—'}
              </span>
            </div>
          </div>

          {/* Destination Path */}
          <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center gap-2 text-xs font-mono text-slate-400 truncate">
            <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate" title={item.finalPath}>
              {item.finalPath}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCompleted && (
              <>
                <button
                  onClick={handleOpenFile}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Open File</span>
                </button>

                <button
                  onClick={handleOpenFolder}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Open Folder</span>
                </button>
              </>
            )}

            {isFailed && (
              <button
                onClick={handleRetry}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Download</span>
              </button>
            )}

            {!isCompleted && !isFailed && (
              <button
                onClick={handlePauseResume}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg flex items-center gap-1.5 ${
                  isDownloading
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                }`}
              >
                {isDownloading ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-white" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Resume</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted && (
              <button
                onClick={handleCancel}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 hover:text-rose-200 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              {isCompleted ? 'Close' : 'Hide'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
