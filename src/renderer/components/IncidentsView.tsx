import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  Clock,
  Radio,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { IncidentRecord } from '../../main/diagnostics/ErrorIncidentEngine';
import { Badge } from './ui/Badge';
import { Language, translations } from '../lib/i18n';

export const IncidentsView: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = translations[lang] || translations.en;
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchIncidents = async () => {
    setFetchError(null);
    try {
      const res = await fetch('/api/incidents');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIncidents(data);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load incidents.');
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-400" />
            <span>Incident Console & Failure Correlation</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Clustered multi-socket failures, network transitions, and automatic recovery timeline
          </p>
        </div>

        <button
          onClick={fetchIncidents}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refresh Console</span>
        </button>
      </div>

      {fetchError && (
        <div role="alert" className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ml-3 text-rose-400 hover:text-rose-200 font-bold">✕</button>
        </div>
      )}

      {/* Incidents List */}
      <div className="space-y-3">
        {incidents.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-500 text-xs space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <div className="font-semibold text-slate-300">Zero active or unresolved incidents</div>
            <div className="text-[11px] text-slate-500">All downloads and network interfaces are running smoothly.</div>
          </div>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.incidentId}
              className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-rose-400">{inc.incidentId}</span>
                    <h3 className="text-sm font-bold text-white">{inc.title}</h3>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Cause: <strong className="text-slate-200">{inc.cause}</strong> • Affected: <strong className="text-amber-400">{inc.affectedDownloadsCount} download(s)</strong>
                  </div>
                </div>

                <Badge variant={inc.recoveryStatus === 'RESOLVED' ? 'success' : 'warning'}>
                  {inc.recoveryStatus}
                </Badge>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 font-mono">
                {inc.details}
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-4">
                <span>Duration: {inc.durationSeconds}s</span>
                <span>•</span>
                <span>Corrupted: {inc.corruptedDownloadsCount} (Zero Loss)</span>
                <span>•</span>
                <span>{new Date(inc.startedAt).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
