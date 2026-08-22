import React from 'react';
import {
  AlertTriangle,
  X,
  Wrench,
  RotateCcw,
  HardDrive,
  Clock,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { DownloadItem, SystemMetrics } from '../../../shared/types';
import { Button } from './Button';

export interface ActionCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  downloads: DownloadItem[];
  metrics: SystemMetrics | null;
  onRepairBrowser: () => void;
  onCleanStorage: () => void;
  onRetryFailed: () => Promise<void> | void;
  isRetrying?: boolean;
  retryError?: string | null;
}

export const ActionCenterDrawer: React.FC<ActionCenterDrawerProps> = ({
  isOpen,
  onClose,
  downloads,
  metrics,
  onRepairBrowser,
  onCleanStorage,
  onRetryFailed,
  isRetrying = false,
  retryError = null,
}) => {
  if (!isOpen) return null;

  const failedItems = downloads.filter((d) => d.status === 'failed');
  const lowStorage = metrics ? metrics.storage.freeBytes < 2 * 1024 * 1024 * 1024 : false;

  const issuesCount = (failedItems.length > 0 ? 1 : 0) + (lowStorage ? 1 : 0);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white">Action Center — Needs Attention</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
        {issuesCount === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <div className="font-semibold text-slate-300">All systems operating normally</div>
            <div className="text-[11px] text-slate-500">No active stalls, storage warnings, or browser issues detected.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Failed Downloads Alert */}
            {failedItems.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-rose-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>{failedItems.length} Download(s) Failed / Interrupted</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-300">
                  {failedItems.map((f) => f.filename).slice(0, 3).join(', ')}
                </div>
                <Button size="xs" variant="danger" onClick={onRetryFailed} isLoading={isRetrying} disabled={isRetrying}>
                  Retry All Failed
                </Button>
                {retryError && <div role="alert" className="text-[11px] text-rose-300">{retryError}</div>}
              </div>
            )}

            {/* Low Storage Alert */}
            {lowStorage && (
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <div className="font-bold text-amber-200 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span>Low Disk Space Headroom</span>
                </div>
                <div className="text-[11px] text-slate-300">
                  Available space on download partition is critically low ({((metrics?.storage.freeBytes || 0) / 1024 / 1024 / 1024).toFixed(1)} GB).
                </div>
                <Button size="xs" variant="amber" onClick={onCleanStorage}>
                  Open Storage Maintenance
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
