import { AppDatabase } from '../db/Database';
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

export class PlaylistBatchGrabber {
  public static async parsePlaylist(playlistUrl: string): Promise<PlaylistResult> {
    const isYoutube = playlistUrl.includes('youtube.com') || playlistUrl.includes('youtu.be');
    const isSoundcloud = playlistUrl.includes('soundcloud.com');
    const isVimeo = playlistUrl.includes('vimeo.com');

    const cleanTitle = isYoutube
      ? 'YouTube Playlist Items'
      : isSoundcloud
      ? 'SoundCloud Track Collection'
      : isVimeo
      ? 'Vimeo Showcase'
      : 'Extracted Batch Collection';

    // Simulated parse/extractor logic supporting playlist URLs
    const tracks: PlaylistTrack[] = [];
    const sampleCount = 5;

    for (let i = 1; i <= sampleCount; i++) {
      const numStr = String(i).padStart(2, '0');
      const title = `Track ${numStr} - ${cleanTitle}`;
      const ext = isSoundcloud ? 'mp3' : 'mp4';
      const filename = `${numStr} - ${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;

      tracks.push({
        trackNumber: i,
        title,
        url: `${playlistUrl}#item_${i}`,
        durationSec: 180 + i * 15,
        resolution: isSoundcloud ? undefined : '1080p',
        filename,
      });
    }

    return {
      playlistTitle: cleanTitle,
      sourceUrl: playlistUrl,
      totalTracks: tracks.length,
      tracks,
    };
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
