import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { MaintenanceScanResult, SystemMetrics } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface StorageMaintenanceViewProps {
  metrics: SystemMetrics | null;
  lang: Language;
}

export const StorageMaintenanceView: React.FC<StorageMaintenanceViewProps> = ({ metrics, lang }) => {
  const t = translations[lang] || translations.en;
  const [scanResult, setScanResult] = useState<MaintenanceScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set());
  const [isCleaning, setIsCleaning] = useState(false);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const res = await api.scanMaintenance();
      setScanResult(res);
      setSelectedOrphans(new Set(res.orphanedPartialFiles.map((o) => o.path)));
    } catch (err: any) {
      alert(`Scan error: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    handleScan();
  }, []);

  const handleCleanSelected = async () => {
    if (selectedOrphans.size === 0) return;
    setIsCleaning(true);
    try {
      const res = await api.cleanOrphanedFiles(Array.from(selectedOrphans));
      alert(`Successfully deleted ${res.cleaned} orphaned files and freed ${formatBytes(res.freedBytes)}!`);
      handleScan();
    } catch (err: any) {
      alert(`Clean error: ${err.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const toggleSelectOrphan = (path: string) => {
    setSelectedOrphans((prev) => {
      const copy = new Set(prev);
      if (copy.has(path)) copy.delete(path);
      else copy.add(path);
      return copy;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-teal-400" />
            <span>Storage Capacity & Disk Maintenance</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Identify orphaned partial chunks, broken tasks, and missing destination files with safe preview before cleanup
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin text-teal-400" /> : <RotateCcw className="w-4 h-4" />}
          <span>Run Maintenance Scan</span>
        </button>
      </div>

      {/* Storage Visual Gauge Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
            <div className="text-xs font-semibold text-slate-400">Available Storage</div>
            <div className="text-2xl font-bold text-teal-400 font-mono">
              {formatBytes(metrics.storage.freeBytes)}
            </div>
            <div className="text-[11px] text-slate-500">
              Total Disk: {formatBytes(metrics.storage.totalBytes)}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
            <div className="text-xs font-semibold text-slate-400">Used Storage</div>
            <div className="text-2xl font-bold text-slate-200 font-mono">
              {formatBytes(metrics.storage.usedBytes)}
            </div>
            <div className="text-[11px] text-slate-500">
              {(((metrics.storage.usedBytes || 1) / (metrics.storage.totalBytes || 1)) * 100).toFixed(1)}% disk utilization
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-2">
            <div className="text-xs font-semibold text-slate-400">Recoverable Partial Data</div>
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {scanResult ? formatBytes(scanResult.totalRecoverableBytes) : '0 B'}
            </div>
            <div className="text-[11px] text-slate-500">
              {scanResult?.orphanedPartialFiles.length || 0} orphaned chunk files
            </div>
          </div>
        </div>
      )}

      {/* Orphaned Partial Files Table */}
      {scanResult && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Orphaned Temporary Files (.part / .g1dm)</h3>
              <p className="text-xs text-slate-400">Files left behind from interrupted or cancelled downloads</p>
            </div>

            {scanResult.orphanedPartialFiles.length > 0 && (
              <button
                onClick={handleCleanSelected}
                disabled={isCleaning || selectedOrphans.size === 0}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
              >
                {isCleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Clean {selectedOrphans.size} Selected Files</span>
              </button>
            )}
          </div>

          {scanResult.orphanedPartialFiles.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
              ✓ No orphaned files detected. Your storage is completely clean!
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 font-mono">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-sans">
                    <th className="p-2.5 w-10 text-center">✓</th>
                    <th className="p-2.5">File Path</th>
                    <th className="p-2.5">Size</th>
                    <th className="p-2.5">Last Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {scanResult.orphanedPartialFiles.map((orphan, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedOrphans.has(orphan.path)}
                          onChange={() => toggleSelectOrphan(orphan.path)}
                          className="rounded border-slate-700 text-rose-600 focus:ring-0 bg-slate-900 cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 text-slate-300 truncate max-w-md" title={orphan.path}>
                        {orphan.path}
                      </td>
                      <td className="p-2.5 text-amber-400 font-bold">{formatBytes(orphan.size)}</td>
                      <td className="p-2.5 text-slate-500 font-sans">
                        {new Date(orphan.modifiedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
