import React, { useState, useRef } from 'react';
import {
  Video,
  Music,
  Play,
  Pause,
  Download,
} from 'lucide-react';
import { DownloadItem } from '../../shared/types';
import { Language, translations } from '../lib/i18n';
import { formatBytes } from '../lib/formatters';

interface MediaLibraryViewProps {
  downloads: DownloadItem[];
  lang: Language;
}

/** Derive a display resolution label from a DownloadItem.
 *  Prefers metadata from the mediaInfo field if present; falls back to filename heuristics. */
function resolveResolution(item: DownloadItem): string {
  const meta = (item as any).mediaInfo;
  if (meta?.height) {
    if (meta.height >= 2160) return '2160p 4K';
    if (meta.height >= 1080) return '1080p FHD';
    if (meta.height >= 720) return '720p HD';
    return `${meta.height}p`;
  }
  const name = item.filename.toLowerCase();
  if (name.includes('2160p') || name.includes('4k') || name.includes('uhd')) return '2160p 4K';
  if (name.includes('1080p') || name.includes('fhd')) return '1080p FHD';
  if (name.includes('720p') || name.includes('hd')) return '720p HD';
  return 'SD';
}

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({ downloads, lang }) => {
  const t = translations[lang] || translations.en;
  const [selectedMedia, setSelectedMedia] = useState<DownloadItem | null>(null);
  const [resolutionFilter, setResolutionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const completedMedia = downloads.filter(
    (d) => d.status === 'completed' && (d.category === 'video' || d.category === 'audio')
  );

  const filteredMedia = completedMedia.filter((m) => {
    if (searchQuery && !m.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (resolutionFilter !== 'all') {
      const res = resolveResolution(m);
      if (resolutionFilter === '4k' && !res.includes('2160')) return false;
      if (resolutionFilter === '1080p' && !res.includes('1080')) return false;
      if (resolutionFilter === '720p' && !res.includes('720')) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto overflow-y-auto h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-amber-400" />
            <span>Completed Media Library & Mini Player</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Browse, play, and organize completed high-definition video and audio streams
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 w-40"
          />
          {/* Resolution Filter Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
            {['all', '4k', '1080p', '720p'].map((res) => (
              <button
                key={res}
                onClick={() => setResolutionFilter(res)}
                className={`px-3 py-1 rounded-lg uppercase transition-colors ${
                  resolutionFilter === res ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Embedded Player Section */}
      {selectedMedia && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-3 animate-in fade-in duration-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white truncate max-w-md">{selectedMedia.filename}</h3>
            </div>
            <button
              onClick={() => setSelectedMedia(null)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl overflow-hidden bg-black aspect-video max-h-72 flex items-center justify-center relative border border-slate-800">
            {selectedMedia.finalPath ? (
              <video
                ref={videoRef}
                key={selectedMedia.id}
                src={`file://${selectedMedia.finalPath}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
                  <Play className="w-6 h-6 fill-amber-400" />
                </div>
                <div className="text-xs font-semibold text-slate-300">Path not available</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Media Catalog Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
            <Video className="w-10 h-10 mx-auto text-slate-700" />
            <div>No completed video or audio files found in library.</div>
            <div className="text-slate-600">Downloads tagged as Video or Audio will automatically catalog here.</div>
          </div>
        ) : (
          filteredMedia.map((media) => (
            <div
              key={media.id}
              onClick={() => setSelectedMedia(media)}
              className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer shadow-xl flex flex-col justify-between group space-y-3"
            >
              <div className="space-y-2">
                <div className="aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-amber-400/80 relative overflow-hidden group-hover:scale-[1.02] transition-transform">
                  {media.category === 'video' ? <Video className="w-8 h-8" /> : <Music className="w-8 h-8" />}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-white font-mono text-[9px] font-bold">
                    {formatBytes(media.downloadedBytes)}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-200 truncate group-hover:text-amber-400 transition-colors" title={media.filename}>
                    {media.filename}
                  </h4>
                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-1">
                    <span className="text-amber-300 font-bold">{resolveResolution(media)}</span>
                    <span>•</span>
                    <span>{new Date(media.completedAt || media.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-mono uppercase">{media.serverCapabilities.protocol}</span>
                <span className="text-slate-500 font-mono">{formatBytes(media.downloadedBytes, 1)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
