import React, { useState } from 'react';
import {
  X,
  Flame,
  CheckCircle2,
  Download,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Video,
  Music,
  ListOrdered,
  Sparkles,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import {
  ComprehensiveMediaAnalysis,
  SecureMediaDetector,
} from '../../main/media/SecureMediaDetector';
import {
  AnalyzedVideoQuality,
  AnalyzedAudioTrack,
  VideoResolutionEngine,
} from '../../main/media/VideoResolutionEngine';
import { DownloadItem } from '../../shared/types';
import { api } from '../lib/api';

interface VideoQualitySelectorModalProps {
  analysis: ComprehensiveMediaAnalysis | null;
  onClose: () => void;
  onDownloadEnqueued?: () => void;
  onDownloadStarted?: (item: DownloadItem) => void;
}

export const VideoQualitySelectorModal: React.FC<VideoQualitySelectorModalProps> = ({
  analysis,
  onClose,
  onDownloadEnqueued,
  onDownloadStarted,
}) => {
  if (!analysis) return null;

  const [selectedQualityId, setSelectedQualityId] = useState<string>(
    analysis.recommendedQuality?.id || analysis.availableVideoQualities[0]?.id || ''
  );
  const [selectedAudioId, setSelectedAudioId] = useState<string>(
    analysis.availableAudioTracks[0]?.id || ''
  );
  const [sortBy, setSortBy] = useState<
    'RECOMMENDED' | 'HIGHEST_QUALITY' | 'LOWEST_QUALITY' | 'BEST_BITRATE' | 'SMALLEST_FILE'
  >('RECOMMENDED');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedQualities = VideoResolutionEngine.sortQualities(
    analysis.availableVideoQualities,
    sortBy
  );

  const selectedQuality = analysis.availableVideoQualities.find((q) => q.id === selectedQualityId);
  const selectedAudio = analysis.availableAudioTracks.find((a) => a.id === selectedAudioId);

  const handleStartDownload = async (action: 'now' | 'later' | 'queue') => {
    if (!selectedQuality) return;

    setIsSubmitting(true);
    try {
      const sanitizedTitle = (analysis.title || 'video')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .trim();
      const ext = selectedQuality.container.toLowerCase().includes('webm')
        ? 'webm'
        : selectedQuality.container.toLowerCase().includes('mkv')
        ? 'mkv'
        : 'mp4';
      const filename = `${sanitizedTitle}.${ext}`;

      const formatSpec = (selectedQuality as any).formatSpec || selectedQuality.id;

      const item = await api.addDownload({
        url: selectedQuality.downloadUrl,
        filename,
        category: 'video',
        formatSpec,
        container: ext,
        thumbnailUrl: analysis.thumbnailUrl,
        startImmediately: action === 'now',
      });

      if (onDownloadStarted && item) {
        onDownloadStarted(item);
      }
      if (onDownloadEnqueued) {
        onDownloadEnqueued();
      }
      onClose();
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="theme-overlay fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            {analysis.thumbnailUrl ? (
              <div className="w-16 h-11 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-md">
                <img src={analysis.thumbnailUrl} alt={analysis.title} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <Video className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white truncate" title={analysis.title}>
                  {analysis.title}
                </h2>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {analysis.deliveryType}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                <span>Duration: {analysis.formattedDuration}</span>
                <span>•</span>
                <span>TLS: {analysis.tlsInfo.cipher || 'TLS 1.3 / AES-GCM'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* DRM Warning Banner if protected */}
          {analysis.isProtected && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center gap-3 text-rose-300">
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <strong className="block text-rose-200 font-bold">Protected DRM Content Boundary</strong>
                <span>{analysis.protectionReason || 'Stream is encrypted with DRM access control that G1DM cannot bypass.'}</span>
              </div>
            </div>
          )}

          {/* Sorter Tabs */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Available Dynamic Resolutions ({sortedQualities.length})</span>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-medium">
              {[
                { id: 'RECOMMENDED', label: '★ Recommended' },
                { id: 'HIGHEST_QUALITY', label: 'Highest Quality' },
                { id: 'BEST_BITRATE', label: 'Best Bitrate' },
                { id: 'SMALLEST_FILE', label: 'Smallest File' },
              ].map((sort) => (
                <button
                  key={sort.id}
                  onClick={() => setSortBy(sort.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                    sortBy === sort.id ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sort.label}
                </button>
              ))}
            </div>
          </div>

          {/* Qualities Table */}
          <div className="space-y-2">
            {sortedQualities.map((q) => {
              const isSelected = q.id === selectedQualityId;
              return (
                <div
                  key={q.id}
                  onClick={() => setSelectedQualityId(q.id)}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-950/30 border-amber-500/50 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-slate-950" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white font-mono">{q.resolutionLabel}</span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {q.width}×{q.height}
                        </span>
                        {q.isHdr && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            HDR
                          </span>
                        )}
                        {q.isRecommended && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ★ Recommended
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <span>{q.bitrateFormatted}</span>
                        <span>•</span>
                        <span>{q.videoCodec}</span>
                        <span>•</span>
                        <span>{q.frameRate} fps</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-200 font-mono">{q.formattedSize}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{q.container}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Audio Stream Selection if separate tracks available */}
          {analysis.availableAudioTracks.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Music className="w-4 h-4 text-purple-400" />
                <span>Audio Rendition Track</span>
              </div>
              <select
                value={selectedAudioId}
                onChange={(e) => setSelectedAudioId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
              >
                {analysis.availableAudioTracks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.languageLabel} — {a.audioCodec} ({a.bitrateFormatted}, {a.sampleRateHz} Hz)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleStartDownload('later')}
              disabled={isSubmitting || !selectedQuality || analysis.isProtected}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
            >
              Download Later
            </button>

            <button
              onClick={() => handleStartDownload('queue')}
              disabled={isSubmitting || !selectedQuality || analysis.isProtected}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Add to Queue</span>
            </button>

            <button
              onClick={() => handleStartDownload('now')}
              disabled={isSubmitting || !selectedQuality || analysis.isProtected}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 flex items-center gap-1.5"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Download ({selectedQuality?.resolutionLabel || 'Selected'})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
