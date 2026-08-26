import React, { useState } from 'react';
import {
  Camera,
  Download,
  Clock,
  Trash2,
} from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { DownloadSnapshot } from '../../main/engine/SnapshotManager';
import { Button } from './ui/Button';
import { Language, translations } from '../lib/i18n';
import { formatBytes } from '../lib/formatters';

interface SnapshotsViewProps {
  downloads: DownloadItem[];
  lang: Language;
  onRefresh: () => void;
}

export const SnapshotsView: React.FC<SnapshotsViewProps> = ({ downloads, lang, onRefresh }) => {
  const t = translations[lang] || translations.en;
  const [selectedDownloadId, setSelectedDownloadId] = useState<string>(downloads[0]?.id || '');
  const [createdSnapshot, setCreatedSnapshot] = useState<DownloadSnapshot | null>(null);
  const [snapshotHistory, setSnapshotHistory] = useState<DownloadSnapshot[]>([]);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const handleCreateSnapshot = async () => {
    const item = downloads.find((d) => d.id === selectedDownloadId);
    if (!item) return;

    setSnapshotError(null);
    try {
      const res = await fetch(`/api/snapshots/${item.id}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const snap = await res.json() as DownloadSnapshot;
      setCreatedSnapshot(snap);
      setSnapshotHistory((prev) => [snap, ...prev]);
    } catch (err: any) {
      setSnapshotError(err.message || 'Failed to create snapshot.');
    }
  };

  const handleDownloadSnapshotFile = () => {
    if (!createdSnapshot) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(createdSnapshot, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${createdSnapshot.snapshotId}.g1dmsnap.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  const handleRemoveFromHistory = (id: string) => {
    setSnapshotHistory((prev) => prev.filter((s) => s.snapshotId !== id));
  };

  const handleDownloadSupportBundle = () => {
    window.open('/api/support-bundle', '_blank');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <span>State Snapshots & Disaster Recovery</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Create sanitized checkpoint snapshots, restore states, and export diagnostics support bundles
          </p>
        </div>

        <Button size="sm" variant="primary" leftIcon={<Download className="w-4 h-4" />} onClick={handleDownloadSupportBundle}>
          Download Support Bundle
        </Button>
      </div>

      {/* Create Snapshot Card */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-400" />
          <span>Create Download State Checkpoint (.g1dmsnap)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Select Target Download</label>
            <select
              value={selectedDownloadId}
              onChange={(e) => setSelectedDownloadId(e.target.value)}
              disabled={downloads.length === 0}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 disabled:opacity-50"
            >
              {downloads.length === 0 ? (
                <option value="">No downloads available</option>
              ) : (
                downloads.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename} ({d.status} • {d.progress.toFixed(1)}%)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              size="md"
              variant="primary"
              className="w-full"
              onClick={handleCreateSnapshot}
              disabled={downloads.length === 0}
            >
              Create Checkpoint Snapshot
            </Button>
          </div>
        </div>

        {snapshotError && (
          <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
            <span>{snapshotError}</span>
            <button onClick={() => setSnapshotError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
          </div>
        )}

        {createdSnapshot && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 animate-in fade-in text-xs font-mono">
            <div className="flex justify-between items-center text-emerald-400 font-bold font-sans">
              <span>✓ Snapshot Generated: {createdSnapshot.snapshotId}</span>
              <button
                onClick={handleDownloadSnapshotFile}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg font-sans text-xs"
              >
                Save .g1dmsnap File
              </button>
            </div>
            <div className="text-slate-300">File: {createdSnapshot.filename}</div>
            <div className="text-slate-400">Total Size: {formatBytes(createdSnapshot.totalBytes)}</div>
            <div className="text-slate-500">Segments Checkpointed: {createdSnapshot.segments.length}</div>
          </div>
        )}
      </div>

      {/* Snapshot History */}
      {snapshotHistory.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Snapshot History (Session)</span>
          </h3>

          <div className="space-y-2 max-h-72 overflow-y-auto text-xs font-mono">
            {snapshotHistory.map((snap) => (
              <div
                key={snap.snapshotId}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
              >
                <div className="space-y-0.5 min-w-0 pr-4">
                  <div className="text-slate-200 font-bold truncate font-sans">{snap.filename}</div>
                  <div className="text-[11px] text-slate-500 font-sans">
                    {snap.snapshotId} &bull; {formatBytes(snap.totalBytes)} &bull; {snap.segments.length} segments
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snap, null, 2));
                      const a = document.createElement('a');
                      a.setAttribute('href', dataStr);
                      a.setAttribute('download', `${snap.snapshotId}.g1dmsnap.json`);
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-950 text-blue-400 hover:text-blue-300 font-sans"
                    title="Download snapshot"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveFromHistory(snap.snapshotId)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 font-sans"
                    title="Remove from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
