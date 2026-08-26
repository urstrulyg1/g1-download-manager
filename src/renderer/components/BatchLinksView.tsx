import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Download,
  Loader2,
} from 'lucide-react';
import { LinkBatchCandidate, DownloadQueue, CategoryRule } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface BatchLinksViewProps {
  queues: DownloadQueue[];
  categories: CategoryRule[];
  lang: Language;
  onAdded: () => void;
}

export const BatchLinksView: React.FC<BatchLinksViewProps> = ({ queues, categories, lang, onAdded }) => {
  const t = translations[lang] || translations.en;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [candidates, setCandidates] = useState<LinkBatchCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [targetCategory, setTargetCategory] = useState('other');
  const [targetQueue, setTargetQueue] = useState('default');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const [enqueueSuccess, setEnqueueSuccess] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setExtractError(null);
    try {
      const res = await api.extractBatchLinks(input.trim());
      setCandidates(res);
    } catch (err: any) {
      setExtractError(err.message || 'Failed to extract links.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setCandidates((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], selected: !copy[idx].selected };
      return copy;
    });
  };

  const handleSelectAll = (select: boolean) => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: select })));
  };

  const handleEnqueueSelected = async () => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) return;

    setIsSubmitting(true);
    setEnqueueError(null);
    setEnqueueSuccess(null);
    try {
      await Promise.all(
        selected.map((item) =>
          api.addDownload({
            url: item.url,
            filename: item.filename,
            category: targetCategory !== 'other' ? targetCategory : item.category,
            queueId: targetQueue,
            startImmediately: true,
          })
        )
      );
      setEnqueueSuccess(`${selected.length} item${selected.length === 1 ? '' : 's'} enqueued successfully.`);
      onAdded();
    } catch (err: any) {
      setEnqueueError(err.message || 'Failed to enqueue downloads.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCandidates = useMemo(
    () => candidates.filter((c) => activeTab === 'all' || c.category === activeTab),
    [candidates, activeTab]
  );

  const selectedCount = useMemo(() => candidates.filter((c) => c.selected).length, [candidates]);

  // Per-tab item counts for the badges
  const tabCounts = useMemo(() => {
    const acc: Record<string, number> = { all: candidates.length };
    for (const c of candidates) {
      acc[c.category] = (acc[c.category] || 0) + 1;
    }
    return acc;
  }, [candidates]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          <span>Batch Link Extractor ("Download All Links")</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Paste a webpage URL or raw HTML/text to parse accessible links, categorize resources, and batch enqueue
        </p>
      </div>

      {/* Input Box Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <label className="text-xs font-semibold text-slate-300">Target Webpage URL or Raw Link Text</label>
        <textarea
          rows={3}
          placeholder="Enter webpage URL (https://example.com/gallery) or paste raw HTML / links list..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
        />

        {extractError && (
          <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
            <span>{extractError}</span>
            <button onClick={() => setExtractError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleExtract}
            disabled={isLoading || !input.trim()}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Extract Accessible Links</span>
          </button>
        </div>
      </div>

      {/* Discovered Candidates Section */}
      {candidates.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            {/* Filter Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium overflow-x-auto">
              {['all', 'video', 'audio', 'document', 'image', 'archive', 'program', 'other'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`px-3 py-1 rounded-lg capitalize whitespace-nowrap transition-colors flex items-center gap-1 ${
                    activeTab === cat ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{cat}</span>
                  {(tabCounts[cat] ?? 0) > 0 && (
                    <span className={`text-[10px] px-1 rounded ${activeTab === cat ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {tabCounts[cat]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Batch Destination & Enqueue */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Category override */}
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                title="Override category for selected items"
              >
                <option value="other">Category: Auto-detect</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    Category: {c.name}
                  </option>
                ))}
              </select>

              <select
                value={targetQueue}
                onChange={(e) => setTargetQueue(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    Queue: {q.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleSelectAll(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Select All
              </button>

              <button
                onClick={() => handleSelectAll(false)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Deselect
              </button>

              <button
                onClick={handleEnqueueSelected}
                disabled={isSubmitting || selectedCount === 0}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Enqueue {selectedCount} Selected</span>
              </button>
            </div>
          </div>

          {enqueueError && (
            <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
              <span>{enqueueError}</span>
              <button onClick={() => setEnqueueError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
            </div>
          )}

          {enqueueSuccess && (
            <div role="status" className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs">
              <span>{enqueueSuccess}</span>
              <button onClick={() => setEnqueueSuccess(null)} className="ml-3 text-emerald-400 hover:text-emerald-200 font-bold">✕</button>
            </div>
          )}

          {/* Candidates List */}
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-sans">
                  <th className="p-2.5 w-10 text-center">✓</th>
                  <th className="p-2.5">File Name</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {filteredCandidates.map((item, idx) => (
                  <tr
                    key={idx}
                    onClick={() => toggleSelect(idx)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSelect(idx)}
                    tabIndex={0}
                    role="row"
                    aria-selected={item.selected}
                    className="hover:bg-slate-800/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 focus-visible:outline-offset-[-2px]"
                  >
                    <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleSelect(idx)}
                        tabIndex={-1}
                        className="rounded border-slate-700 text-cyan-600 focus:ring-0 bg-slate-900 cursor-pointer"
                      />
                    </td>
                    <td className="p-2.5 text-slate-200 font-semibold truncate max-w-xs">{item.filename}</td>
                    <td className="p-2.5 font-sans">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-bold">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400 truncate max-w-md" title={item.url}>
                      {item.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
