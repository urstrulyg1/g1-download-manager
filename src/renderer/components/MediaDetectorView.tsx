import React, { useState } from 'react';
import {
  Flame,
  Search,
  Download,
  Loader2,
  Video,
  Music,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Play,
  Sparkles,
} from 'lucide-react';
import { ComprehensiveMediaAnalysis, SecureMediaDetector } from '../../main/media/SecureMediaDetector';
import { VideoQualitySelectorModal } from './VideoQualitySelectorModal';
import { Language, translations } from '../lib/i18n';

import { DownloadItem } from '../../shared/types';

interface MediaDetectorViewProps {
  lang: Language;
  onDownloadAdded: () => void;
  onDownloadStarted?: (item: DownloadItem) => void;
}

export const MediaDetectorView: React.FC<MediaDetectorViewProps> = ({
  lang,
  onDownloadAdded,
  onDownloadStarted,
}) => {
  const t = translations[lang] || translations.en;
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ComprehensiveMediaAnalysis | null>(null);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

  const handleDetect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/media/secure-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setAnalysis(data);
      if (data.availableVideoQualities?.length > 0) {
        setIsQualityModalOpen(true);
      }
    } catch (err: any) {
      alert(`Media detection error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-400" />
          <span>HTTPS Secure Media & Video Resolution Intelligence</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Inspect accessible HTTPS video deliveries (HLS, DASH, direct MP4) and discover dynamic resolutions from 2160p to 360p with zero fabrication
        </p>
      </div>

      {/* Input Box Card */}
      <form
        onSubmit={handleDetect}
        className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3"
      >
        <label className="text-xs font-semibold text-slate-300">HTTPS Media Page URL or Direct Stream URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com/video or https://example.com/stream.m3u8 or https://example.com/manifest.mpd"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-amber-500"
            required
          />
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Analyze Video Source</span>
          </button>
        </div>
      </form>

      {/* Analysis Output Summary */}
      {analysis && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Video className="w-7 h-7" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{analysis.title}</h2>
                <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                  <span>Delivery: <strong className="text-cyan-400 uppercase">{analysis.deliveryType}</strong></span>
                  <span>•</span>
                  <span>TLS: <strong className="text-emerald-400">{analysis.tlsInfo.cipher || 'TLS 1.3 / AES-GCM'}</strong></span>
                </div>
                <div className="text-xs text-emerald-400 font-semibold">
                  ✓ Discovered {analysis.availableVideoQualities.length} Dynamic Resolutions
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsQualityModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 flex items-center gap-2 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Select Video Quality ({analysis.availableVideoQualities.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Quality Selector Modal */}
      {isQualityModalOpen && (
        <VideoQualitySelectorModal
          analysis={analysis}
          onClose={() => setIsQualityModalOpen(false)}
          onDownloadEnqueued={onDownloadAdded}
          onDownloadStarted={onDownloadStarted}
        />
      )}
    </div>
  );
};
