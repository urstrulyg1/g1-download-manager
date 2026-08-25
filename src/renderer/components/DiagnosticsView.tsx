import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RotateCcw,
  Download,
  Loader2,
  ShieldCheck,
  HardDrive,
  Globe,
  Radio,
  Cpu,
  Lock,
} from 'lucide-react';
import { DiagnosticCheckResult, SystemMetrics } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface DiagnosticsViewProps {
  lang: Language;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ lang }) => {
  const t = translations[lang] || translations.en;
  const [results, setResults] = useState<DiagnosticCheckResult[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostics = async () => {
    setIsRunning(true);
    try {
      const [diagRes, metricsRes] = await Promise.all([
        api.runDiagnostics(),
        api.getMetrics().catch(() => null),
      ]);
      setResults(diagRes);
      if (metricsRes) setMetrics(metricsRes);
    } catch (err: any) {
      alert(`Diagnostics error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const handleExport = () => {
    window.open('/api/diagnostics/export', '_blank');
  };

  const handleExportCrashReport = () => {
    window.open('/api/diagnostics/crash-report', '_blank');
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-400" />
            <span>Diagnostics Center & System Health</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time automated tests for network latency, DNS resolution, TLS certificates, disk throughput, and engine workers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runDiagnostics}
            disabled={isRunning}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : <RotateCcw className="w-4 h-4" />}
            <span>Run Diagnostics</span>
          </button>

          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30"
          >
            <Download className="w-4 h-4" />
            <span>Export Diagnostics</span>
          </button>

          <button
            onClick={handleExportCrashReport}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Crash Report</span>
          </button>
        </div>
      </div>

      {/* System Metrics Overview Cards */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 shadow-lg">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Runtime & Platform</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              G1DM v1.0.0
            </div>
            <div className="text-[11px] text-slate-400">
              Memory: <strong className="text-slate-200">{formatBytes(metrics.engine.memoryUsageBytes)}</strong> (Heap)
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 shadow-lg">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <span>Storage Free Space</span>
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono">
              {formatBytes(metrics.storage.freeBytes)} Free
            </div>
            <div className="text-[11px] text-slate-400">
              Total Capacity: <strong className="text-slate-200">{formatBytes(metrics.storage.totalBytes)}</strong>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 shadow-lg">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>Engine Workers</span>
            </div>
            <div className="text-lg font-bold text-cyan-400 font-mono">
              {metrics.engine.activeWorkers} Active / {metrics.engine.queuedJobs} Queued
            </div>
            <div className="text-[11px] text-slate-400">
              Sockets: <strong className="text-slate-200">{metrics.engine.totalConnections} active TCP/TLS</strong>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 shadow-lg">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Network State</span>
            </div>
            <div className="text-lg font-bold text-white font-mono flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{metrics.network.online ? 'Online' : 'Offline'}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Ping Latency: <strong className="text-emerald-400">{metrics.network.pingLatencyMs > 0 ? `${metrics.network.pingLatencyMs}ms` : '< 15ms'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Results Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.map((check) => {
          let statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
          let statusBg = 'bg-emerald-950/20 border-emerald-500/30';
          let badgeText = 'PASS';
          let badgeColor = 'bg-emerald-500/20 text-emerald-300';

          if (check.status === 'warning') {
            statusIcon = <AlertTriangle className="w-5 h-5 text-amber-400" />;
            statusBg = 'bg-amber-950/20 border-amber-500/30';
            badgeText = 'WARNING';
            badgeColor = 'bg-amber-500/20 text-amber-300';
          } else if (check.status === 'error') {
            statusIcon = <XCircle className="w-5 h-5 text-rose-400" />;
            statusBg = 'bg-rose-950/20 border-rose-500/30';
            badgeText = 'FAIL';
            badgeColor = 'bg-rose-500/20 text-rose-300';
          } else if (check.status === 'unsupported') {
            statusIcon = <HelpCircle className="w-5 h-5 text-slate-400" />;
            statusBg = 'bg-slate-900/60 border-slate-800';
            badgeText = 'UNAVAILABLE';
            badgeColor = 'bg-slate-800 text-slate-400';
          }

          return (
            <div
              key={check.id}
              className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between space-y-3 ${statusBg}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon}
                  <div>
                    <h3 className="text-sm font-bold text-white">{check.name}</h3>
                    <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">
                      Category: {check.category}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {badgeText}
                </span>
              </div>

              <div className="text-xs text-slate-200 font-medium">{check.message}</div>

              {check.details && (
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-[11px] text-slate-400">
                  {check.details}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
