import React from 'react';
import {
  Sparkles,
  Download,
  ListOrdered,
  CheckCircle2,
  Clock,
  Shield,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { UnifiedMediaResource, UnifiedVideoVariant } from '../../main/media/UnifiedMediaModel';
import { VideoResolutionEngine } from '../../main/media/VideoResolutionEngine';

interface MediaComparisonViewProps {
  resource: UnifiedMediaResource;
  currentNetworkSpeedBytesPerSec: number;
  onSelectVariant: (variant: UnifiedVideoVariant, action: 'now' | 'queue') => void;
}

export const MediaComparisonView: React.FC<MediaComparisonViewProps> = ({
  resource,
  currentNetworkSpeedBytesPerSec,
  onSelectVariant,
}) => {
  const speed = currentNetworkSpeedBytesPerSec > 0 ? currentNetworkSpeedBytesPerSec : 5 * 1024 * 1024; // 5MB/s default baseline

  const calculateEtaSeconds = (sizeBytes?: number) => {
    if (!sizeBytes || sizeBytes <= 0) return 'Stream';
    const sec = Math.ceil(sizeBytes / speed);
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    if (mins >= 60) {
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    return `${mins}m ${String(remainingSecs).padStart(2, '0')}s`;
  };

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Side-by-Side Quality & Completion Time Matrix</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Estimated completion times computed dynamically from measured network speed ({VideoResolutionEngine.formatBytes(speed)}/s)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 font-mono text-xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 font-sans">
              <th className="p-3">Quality</th>
              <th className="p-3">Dimensions</th>
              <th className="p-3">Codec</th>
              <th className="p-3">Bitrate</th>
              <th className="p-3">HDR/SDR</th>
              <th className="p-3">Est. File Size</th>
              <th className="p-3">Est. Completion</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-[11px]">
            {resource.videoVariants.map((variant) => {
              const size = variant.exactSizeBytes || variant.estimatedSizeBytes;
              return (
                <tr key={variant.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-bold text-white flex items-center gap-1.5 font-sans">
                    <span>{variant.resolutionLabel}</span>
                    {variant.isRecommended && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ★ BEST
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-slate-300">{variant.width}×{variant.height}</td>
                  <td className="p-3 text-cyan-400">{variant.videoCodec}</td>
                  <td className="p-3 text-slate-300">{variant.bitrateFormatted}</td>
                  <td className="p-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        variant.isHdr ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {variant.hdrLabel}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-slate-200">{variant.formattedSize}</td>
                  <td className="p-3 text-emerald-400 font-semibold">{calculateEtaSeconds(size)}</td>
                  <td className="p-3 text-right font-sans">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelectVariant(variant, 'queue')}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                        title="Add to Queue"
                      >
                        Queue
                      </button>
                      <button
                        onClick={() => onSelectVariant(variant, 'now')}
                        className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
