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
import { DiagnosticCheckResult } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { api } from '../lib/api';

interface DiagnosticsViewProps {
  lang: Language;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ lang }) => {
  const t = translations[lang] || translations.en;
  const [results, setResults] = useState<DiagnosticCheckResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostics = async () => {
    setIsRunning(true);
    try {
      const res = await api.runDiagnostics();
      setResults(res);
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
            <span>Export Redacted Report</span>
          </button>
        </div>
      </div>

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
