import React from 'react';
import { Download, Plus, X, ListOrdered } from 'lucide-react';

interface ClipboardToastProps {
  url: string | null;
  onDownloadNow: (url: string) => void;
  onAddToQueue: (url: string) => void;
  onDismiss: () => void;
}

export const ClipboardToast: React.FC<ClipboardToastProps> = ({
  url,
  onDownloadNow,
  onAddToQueue,
  onDismiss,
}) => {
  if (!url) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-blue-500/50 rounded-2xl shadow-2xl p-4 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Downloadable URL Detected</h4>
            <p className="text-[11px] text-slate-400 font-mono truncate max-w-[220px] mt-0.5" title={url}>
              {url}
            </p>
          </div>
        </div>

        <button onClick={onDismiss} className="text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs font-semibold">
        <button
          onClick={() => onAddToQueue(url)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          Add to Queue
        </button>
        <button
          onClick={() => onDownloadNow(url)}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
        >
          Download Now
        </button>
      </div>
    </div>
  );
};
