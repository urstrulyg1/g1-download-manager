import React from 'react';
import { Download, X } from 'lucide-react';

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
    <aside
      role="status"
      aria-live="polite"
      aria-label="Clipboard URL detected"
      className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-blue-500/50 rounded-2xl shadow-2xl p-4 max-w-sm w-full animate-toast-in"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
            <Download className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Downloadable URL Detected</h4>
            <p className="text-[11px] text-slate-400 font-mono truncate max-w-[220px] mt-0.5" title={url}>
              {url}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss clipboard notification"
          className="text-slate-400 hover:text-white p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => onAddToQueue(url)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          Add to Queue
        </button>
        <button
          type="button"
          onClick={() => onDownloadNow(url)}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
        >
          Download Now
        </button>
      </div>
    </aside>
  );
};
