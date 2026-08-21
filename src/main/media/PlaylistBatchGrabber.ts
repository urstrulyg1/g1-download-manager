import { execFile } from 'child_process';
import { DownloadEngine } from '../engine/DownloadEngine';

export interface PlaylistTrack {
  trackNumber: number;
  title: string;
  url: string;
  durationSec?: number;
  artist?: string;
  resolution?: string;
  filename: string;
}

export interface PlaylistResult {
  playlistTitle: string;
  sourceUrl: string;
  totalTracks: number;
  tracks: PlaylistTrack[];
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  duration?: number;
  uploader?: string;
  artist?: string;
  height?: number;
}

/**
 * Playlist extraction backed by `yt-dlp` (YouTube, Vimeo, SoundCloud, and
 * many other sites). No longer fabricates placeholder tracks — when yt-dlp is
 * not installed it raises a descriptive error so callers can surface a clear
 * message instead of silently enqueuing garbage.
 */
export class PlaylistBatchGrabber {
  public static isYtDlpAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('yt-dlp', ['--version'], (err) => resolve(!err));
    });
  }

  public static async parsePlaylist(playlistUrl: string): Promise<PlaylistResult> {
    if (!(await this.isYtDlpAvailable())) {
      throw new Error(
        'Playlist extraction requires yt-dlp, which is not installed. ' +
          'Install it (e.g. `pip install yt-dlp`) and try again.'
      );
    }

    const raw = await new Promise<string>((resolve, reject) => {
      execFile(
        'yt-dlp',
        ['-J', '--flat-playlist', '--no-warnings', playlistUrl],
        { maxBuffer: 64 * 1024 * 1024 },
        (err, stdout) => {
          if (err) reject(new Error(err.message || 'yt-dlp failed to parse the playlist'));
          else resolve(stdout);
        }
      );
    });

    let parsed: { title?: string; entries?: YtDlpEntry[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('yt-dlp returned invalid JSON');
    }

    const entries = parsed.entries || [];
    const tracks: PlaylistTrack[] = entries
      .map((entry, idx) => {
        const url = entry.webpage_url || entry.url || `${playlistUrl}#item_${idx + 1}`;
        const title = entry.title || `Item ${idx + 1}`;
        const filename = this.buildFilename(title, url, idx);
        return {
          trackNumber: idx + 1,
          title,
          url,
          durationSec: entry.duration,
          artist: entry.artist || entry.uploader,
          resolution: entry.height ? `${entry.height}p` : undefined,
          filename,
        };
      })
      .filter((t) => t.url.startsWith('http'));

    return {
      playlistTitle: parsed.title || 'Extracted Playlist',
      sourceUrl: playlistUrl,
      totalTracks: tracks.length,
      tracks,
    };
  }

  private static buildFilename(title: string, url: string, idx: number): string {
    const safe = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 120) || `item_${idx + 1}`;
    const numStr = String(idx + 1).padStart(2, '0');
    const isAudio = /soundcloud\.com/i.test(url);
    const ext = isAudio ? 'mp3' : 'mp4';
    return `${numStr} - ${safe}.${ext}`;
  }

  public static async enqueuePlaylist(
    playlistResult: PlaylistResult,
    engine: DownloadEngine,
    destinationDir?: string
  ): Promise<string[]> {
    const enqueuedIds: string[] = [];
    for (const track of playlistResult.tracks) {
      const item = await engine.addDownload({
        url: track.url,
        filename: track.filename,
        destinationDir,
        category: track.filename.endsWith('.mp3') ? 'audio' : 'video',
        startImmediately: true,
      });
      enqueuedIds.push(item.id);
    }
    return enqueuedIds;
  }
}
