import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, X, AlertTriangle, HardDrive, CheckCircle2 } from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { api } from '../lib/api';

interface CrashRecoveryBannerProps {
  onRefresh?: () => void;
  onSelectDownload?: (item: DownloadItem) => void;
}

export const CrashRecoveryBanner: React.FC<CrashRecoveryBannerProps> = ({ onRefresh, onSelectDownload }) => {
  const [interrupted, setInterrupted] = useState<DownloadItem[]>([]);
  const [isResuming, setIsResuming] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    api.getInterruptedDownloads()
      .then((items) => {
        if (isMounted && items && items.length > 0) {
          setInterrupted(items);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  if (isDismissed || interrupted.length === 0) return null;

  const handleResumeAll = async () => {
    setIsResuming(true);
    try {
      await Promise.all(interrupted.map((item) => api.resumeDownload(item.id)));
      await api.dismissInterruptedDownloads();
      setInterrupted([]);
      setIsDismissed(true);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to resume interrupted downloads:', err);
    } finally {
      setIsResuming(false);
    }
  };

  const handleResumeOne = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.resumeDownload(id);
      setInterrupted((prev) => prev.filter((item) => item.id !== id));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`Failed to resume download ${id}:`, err);
    }
  };

  const handleDismiss = async () => {
    setIsDismissed(true);
    await api.dismissInterruptedDownloads().catch(() => {});
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div
      role="region"
      aria-label="Crash recovery notice"
      className="mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-indigo-950/70 border border-amber-500/40 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 flex-shrink-0 mt-0.5">
            <RefreshCw className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Interrupted Downloads Recovered</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-semibold border border-amber-500/30">
                  {interrupted.length} file{interrupted.length > 1 ? 's' : ''}
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              G1DM detected incomplete downloads from a previous session. Chunks and partial files have been verified and preserved.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-center flex-shrink-0">
          <button
            onClick={handleResumeAll}
            disabled={isResuming}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all duration-150"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>{isResuming ? 'Resuming All…' : 'Resume All'}</span>
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 active:scale-95 transition-all duration-150"
          >
            Review Later
          </button>
        </div>
      </div>

      {/* Item summary pills */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {interrupted.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectDownload && onSelectDownload(item)}
            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-amber-500/30 cursor-pointer transition-colors"
          >
            <div className="min-w-0 flex-1 pr-2">
              <div className="text-xs font-semibold text-slate-200 truncate">{item.filename}</div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                <span className="text-cyan-400 font-semibold">{item.progress.toFixed(1)}%</span>
                <span>•</span>
                <span>{item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Stream'}</span>
              </div>
            </div>
            <button
              onClick={(e) => handleResumeOne(item.id, e)}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold flex items-center gap-1 flex-shrink-0"
              title="Resume download"
              aria-label={`Resume download ${item.filename}`}
            >
              <Play className="w-3 h-3 fill-emerald-300" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
