import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Globe,
  Radio,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
} from 'lucide-react';
import { DownloadItem, SystemMetrics } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { Button } from './ui/Button';

interface AnalyticsViewProps {
  downloads: DownloadItem[];
  metrics: SystemMetrics | null;
  lang: Language;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ downloads, metrics, lang }) => {
  const t = translations[lang] || translations.en;
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const totalBytes = downloads.reduce((sum, d) => sum + d.downloadedBytes, 0);
  const completedItems = downloads.filter((d) => d.status === 'completed');
  const failedItems = downloads.filter((d) => d.status === 'failed');

  // Honest statistics: a success rate is only defined when at least one real
  // download exists — no fabricated 100% for an empty history.
  const successRatePct = downloads.length > 0 ? Math.round((completedItems.length / downloads.length) * 100) : null;
  const avgSpeed = completedItems.length > 0 ? Math.round(completedItems.reduce((sum, d) => sum + (d.avgSpeed || 0), 0) / completedItems.length) : 0;
  const peakSpeed = Math.max(...downloads.map((d) => d.peakSpeed || 0), 0);

  // Protocol Distribution
  const protocolsCount: Record<string, number> = {};
  downloads.forEach((d) => {
    const p = (d.serverCapabilities.protocol || 'https').toUpperCase();
    protocolsCount[p] = (protocolsCount[p] || 0) + 1;
  });

  // Domain Distribution
  const domainCount: Record<string, { count: number; bytes: number }> = {};
  downloads.forEach((d) => {
    try {
      const dom = new URL(d.url).hostname;
      if (!domainCount[dom]) domainCount[dom] = { count: 0, bytes: 0 };
      domainCount[dom].count++;
      domainCount[dom].bytes += d.downloadedBytes;
    } catch {}
  });

  const topDomains = Object.entries(domainCount)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 5);

  const handleExportCsv = () => {
    const rows = [
      ['ID', 'Filename', 'URL', 'Category', 'DownloadedBytes', 'TotalBytes', 'Status', 'AvgSpeed', 'CreatedAt'],
      ...downloads.map((d) => [
        d.id,
        d.filename,
        d.url,
        d.category,
        d.downloadedBytes,
        d.totalBytes,
        d.status,
        d.avgSpeed,
        new Date(d.createdAt).toISOString(),
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `g1dm_analytics_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <span>Local Analytics & Historical Insights</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Privacy-preserving local performance intelligence computed from verified download history
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
            {(['24h', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1 rounded-lg uppercase transition-colors ${
                  timeRange === r ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <Button size="sm" variant="outline" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-1">
          <div className="text-slate-400 font-semibold">Total Download Volume</div>
          <div className="text-2xl font-extrabold text-white font-mono">{formatBytes(totalBytes)}</div>
          <div className="text-[11px] text-slate-500">{downloads.length} total managed items</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-1">
          <div className="text-slate-400 font-semibold">Average Transfer Rate</div>
          <div className="text-2xl font-extrabold text-cyan-400 font-mono">{formatBytes(avgSpeed)}/s</div>
          <div className="text-[11px] text-slate-500">Across verified completions</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-1">
          <div className="text-slate-400 font-semibold">Historical Peak Speed</div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">{formatBytes(peakSpeed)}/s</div>
          <div className="text-[11px] text-slate-500">Multi-worker peak throughput</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-1">
          <div className="text-slate-400 font-semibold">Transfer Success Rate</div>
          <div className="text-2xl font-extrabold text-purple-400 font-mono">{successRatePct === null ? '—' : `${successRatePct}%`}</div>
          <div className="text-[11px] text-slate-500">{failedItems.length} unrecoverable failures</div>
        </div>
      </div>

      {/* Protocol & Top Domains Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Protocol Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <span>Protocol Distribution</span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            {Object.entries(protocolsCount).map(([proto, count]) => {
              const pct = Math.round((count / (downloads.length || 1)) * 100);
              return (
                <div key={proto} className="space-y-1">
                  <div className="flex justify-between text-slate-300 font-bold">
                    <span>{proto}</span>
                    <span>{count} downloads ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Download Domains */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Top Source Domains</span>
          </h3>

          <div className="space-y-2 text-xs">
            {topDomains.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No domain history recorded yet.</div>
            ) : (
              topDomains.map(([dom, data]) => (
                <div key={dom} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <div className="font-mono text-slate-200 font-semibold truncate max-w-xs">{dom}</div>
                  <div className="text-right font-mono">
                    <div className="text-cyan-300 font-bold">{formatBytes(data.bytes)}</div>
                    <div className="text-[10px] text-slate-500">{data.count} files</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
