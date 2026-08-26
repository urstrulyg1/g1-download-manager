import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, FileText, CheckSquare, Square, X, HardDrive } from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { formatBytes } from '../lib/utils';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  item: DownloadItem | null;
  items?: DownloadItem[];
  onConfirm: (deleteFiles: boolean) => void;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  item,
  items,
  onConfirm,
  onClose,
}) => {
  const [deleteFromDisk, setDeleteFromDisk] = useState(true);

  // Reset checkbox state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDeleteFromDisk(true);
    }
  }, [isOpen]);

  if (!isOpen || (!item && (!items || items.length === 0))) return null;

  const targetItems = items && items.length > 0 ? items : item ? [item] : [];
  const isMultiple = targetItems.length > 1;
  const singleItem = targetItems[0];

  const totalBytes = targetItems.reduce((acc, curr) => acc + (curr.totalBytes || curr.downloadedBytes || 0), 0);
  const locationPath = singleItem?.finalPath || (singleItem?.destinationDir ? `${singleItem.destinationDir}/${singleItem.filename}` : '');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter') {
      e.stopPropagation();
      onConfirm(deleteFromDisk);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {isMultiple ? `Delete ${targetItems.length} Downloads?` : 'Delete Download?'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Confirmation required before removal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-300">
            {isMultiple ? (
              <p>
                Are you sure you want to delete <span className="font-bold text-white">{targetItems.length}</span> selected downloads?
              </p>
            ) : (
              <p>
                Are you sure you want to delete <span className="font-bold text-white truncate inline-block max-w-xs align-bottom">"{singleItem.filename}"</span>?
              </p>
            )}
          </div>

          {/* Details Card */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 font-mono text-xs">
            {!isMultiple && (
              <div className="flex items-center gap-2 text-slate-300">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="truncate font-semibold text-slate-200">{singleItem.filename}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Total Size:</span>
              <span className="text-slate-200 font-semibold">{formatBytes(totalBytes)}</span>
            </div>
            {locationPath && !isMultiple && (
              <div className="pt-1 border-t border-slate-800/60 text-[10.5px] text-slate-400">
                <div className="flex items-center gap-1 mb-0.5 text-slate-400">
                  <HardDrive className="w-3 h-3 text-cyan-400" />
                  <span>Storage Location:</span>
                </div>
                <div className="text-slate-300 truncate bg-slate-900/90 px-2 py-1 rounded border border-slate-800" title={locationPath}>
                  {locationPath}
                </div>
              </div>
            )}
          </div>

          {/* Delete from disk checkbox */}
          <div
            onClick={() => setDeleteFromDisk(!deleteFromDisk)}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
              deleteFromDisk
                ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <button
              type="button"
              className="mt-0.5 text-rose-400 focus:outline-none"
              aria-label="Toggle delete from disk"
            >
              {deleteFromDisk ? (
                <CheckSquare className="w-4 h-4 text-rose-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
            </button>
            <div className="text-xs">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Also delete real file(s) from disk</span>
                <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold">
                  PERMANENT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {deleteFromDisk
                  ? 'The actual downloaded file will be permanently removed from your computer.'
                  : 'Only remove the entry from G1DM; keep the downloaded file on your computer.'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            No, Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(deleteFromDisk)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Yes, Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
