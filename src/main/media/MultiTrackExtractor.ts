import * as http from 'http';
import * as https from 'https';

export interface AudioTrack {
  id: string;
  language: string;
  name: string;
  channels: number;
  bitrateKbps: number;
  url: string;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  name: string;
  format: 'vtt' | 'srt';
  url: string;
}

export interface MultiTrackManifest {
  mediaUrl: string;
  videoTracksCount: number;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
}

/**
 * Extracts audio & subtitle renditions from an HLS master playlist
 * (#EXT-X-MEDIA tags). Returns empty lists (rather than fabricated tracks)
 * when no alternate renditions are present or the manifest cannot be fetched.
 */
export class MultiTrackExtractor {
  public static async extractTracks(manifestUrl: string): Promise<MultiTrackManifest> {
    const audioTracks: AudioTrack[] = [];
    const subtitleTracks: SubtitleTrack[] = [];
    let videoTracksCount = 0;

    try {
      const content = await this.fetchText(manifestUrl, 15000);
      const lines = content.split(/\r?\n/);

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          videoTracksCount++;
          continue;
        }
        if (!line.startsWith('#EXT-X-MEDIA:')) continue;

        const attrs = this.parseAttributeList(line.slice('#EXT-X-MEDIA:'.length));
        const type = attrs.TYPE;
        const uri = attrs.URI;
        const name = attrs.NAME || 'Unknown';
        const language = attrs.LANGUAGE || 'und';

        if (type === 'AUDIO' && uri) {
          audioTracks.push({
            id: attrs['GROUP-ID'] ? `${attrs['GROUP-ID']}_${language}` : `audio_${language}_${audioTracks.length}`,
            language,
            name,
            channels: attrs.CHANNELS ? parseInt(attrs.CHANNELS.split('/')[0], 10) : 2,
            bitrateKbps: 0,
            url: this.resolveUrl(uri, manifestUrl),
          });
        } else if (type === 'SUBTITLES' && uri) {
          const format: 'vtt' | 'srt' = uri.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
          subtitleTracks.push({
            id: attrs['GROUP-ID'] ? `${attrs['GROUP-ID']}_${language}` : `sub_${language}_${subtitleTracks.length}`,
            language,
            name,
            format,
            url: this.resolveUrl(uri, manifestUrl),
          });
        }
      }
    } catch {
      // Manifest fetch/parse failure — return what we have (likely empty).
    }

    return { mediaUrl: manifestUrl, videoTracksCount, audioTracks, subtitleTracks };
  }

  private static parseAttributeList(input: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(input)) !== null) {
      const key = match[1];
      const value = match[3] !== undefined ? match[3] : match[4] || '';
      attrs[key] = value;
    }
    return attrs;
  }

  private static resolveUrl(uri: string, baseUrl: string): string {
    try {
      return new URL(uri, baseUrl).href;
    } catch {
      return uri;
    }
  }

  private static fetchText(targetUrl: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;
      const req = reqMod.get(targetUrl, { timeout: timeoutMs }, (res) => {
        if ((res.statusCode || 500) >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 2 * 1024 * 1024) res.destroy();
        });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Manifest fetch timed out')));
    });
  }
}
