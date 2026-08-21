import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, Volume2, Maximize, RefreshCw, Film, Music, CheckCircle2, DownloadCloud } from 'lucide-react';
import { DownloadItem } from '../../shared/types';

interface MediaPreviewModalProps {
  item: DownloadItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({ item, isOpen, onClose }) => {
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [previewStatus, setPreviewStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!isOpen || !item) return;

    const fetchStatus = async () => {
      try {
        setIsLoadingStatus(true);
        const res = await fetch(`/api/downloads/${item.id}/preview-status`);
        const json = await res.json();
        setPreviewStatus(json);
      } catch (err) {
        console.warn('Failed to fetch preview status:', err);
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const isAudio = item.category === 'audio' || item.filename?.match(/\.(mp3|flac|wav|m4a|aac|opus|ogg)$/i);
  const streamUrl = `/api/downloads/${item.id}/stream`;

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleReload = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      videoRef.current.load();
      videoRef.current.currentTime = currentTime;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {isAudio ? <Music className="w-5 h-5" /> : <Film className="w-5 h-5" />}
            </div>
            <div className="truncate">
              <h3 className="text-base font-bold text-white truncate">{item.filename || 'Media Preview'}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>{item.category?.toUpperCase()}</span>
                <span>•</span>
                <span className="font-mono text-cyan-400">
                  {previewStatus ? `${previewStatus.progressPercentage}% downloaded` : 'Live Stream'}
                </span>
                {item.status === 'completed' && (
                  <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video / Audio Player Viewport */}
        <div className="relative bg-black flex items-center justify-center min-h-[340px] max-h-[520px] overflow-hidden group">
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            autoPlay
            playsInline
            className="w-full max-h-[520px] object-contain"
          />
        </div>

        {/* Player Controls & Stream Stats Bar */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Speed:</span>
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
              <button
                key={s}
                onClick={() => handleSpeedChange(s)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  playbackSpeed === s
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
              title="Reload stream buffer from disk"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
              <span>Refresh Buffer</span>
            </button>

            <button
              onClick={() => {
                if (videoRef.current) {
                  if (videoRef.current.requestFullscreen) videoRef.current.requestFullscreen();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold transition"
            >
              <Maximize className="w-3.5 h-3.5" />
              <span>Fullscreen</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
