import React, { useState } from 'react';
import {
  Inbox,
  Download,
  Trash2,
  CheckCircle2,
  Plus,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { DownloadQueue, CategoryRule } from '../../shared/types';
import { InboxItem } from '../../main/engine/DownloadInbox';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface DownloadInboxViewProps {
  inboxItems: InboxItem[];
  queues: DownloadQueue[];
  categories: CategoryRule[];
  lang: Language;
  onClearInbox: () => void;
  onRefresh: () => void;
}

export const DownloadInboxView: React.FC<DownloadInboxViewProps> = ({
  inboxItems,
  queues,
  categories,
  lang,
  onClearInbox,
  onRefresh,
}) => {
  const t = translations[lang] || translations.en;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(inboxItems.map((i) => i.id)));
  const [targetQueue, setTargetQueue] = useState('default');
  const [isEnqueuing, setIsEnqueuing] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadSelected = async () => {
    const toDownload = inboxItems.filter((i) => selectedIds.has(i.id));
    if (toDownload.length === 0) return;

    setIsEnqueuing(true);
    try {
      await Promise.all(
        toDownload.map((item) =>
          api.addDownload({
            url: item.url,
            filename: item.suggestedFilename,
            category: item.suggestedCategory,
            queueId: targetQueue,
            startImmediately: true,
          })
        )
      );
      onClearInbox();
      onRefresh();
    } catch (err: any) {
      alert(`Error enqueuing downloads: ${err.message}`);
    } finally {
      setIsEnqueuing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Inbox className="w-5 h-5 text-indigo-400" />
            <span>Download Inbox</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Incoming captured links from browser extensions, clipboard, and sniffer staged for your review
          </p>
        </div>

        {inboxItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={onClearInbox}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Clear Inbox
            </button>

            <button
              onClick={handleDownloadSelected}
              disabled={isEnqueuing || selectedIds.size === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {selectedIds.size} Selected</span>
            </button>
          </div>
        )}
      </div>

      {/* Inbox Items Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {inboxItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs space-y-2">
            <Inbox className="w-10 h-10 mx-auto text-slate-700" />
            <div>Your Download Inbox is empty.</div>
            <div className="text-slate-600">
              Links detected from browser integration, clipboard, or media detector will stage here.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {inboxItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    isSelected ? 'bg-blue-950/30 border-blue-500/40' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-slate-700 text-blue-600 focus:ring-0 bg-slate-900 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate">{item.suggestedFilename}</div>
                      <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={item.url}>
                        {item.url}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] uppercase">
                      {item.source}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      {new Date(item.capturedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
