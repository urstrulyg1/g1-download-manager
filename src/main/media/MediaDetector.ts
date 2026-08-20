import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { MediaDetectionResult, MediaFormatOption } from '../../shared/types';
import { ProbeService } from '../engine/ProbeService';

export class MediaDetector {
  public static async detectMedia(pageUrl: string): Promise<MediaDetectionResult> {
    const parsed = new URL(pageUrl);
    const directExt = path.extname(parsed.pathname).toLowerCase();

    // Check if the URL itself is already a direct media file
    const directMediaExts = ['.mp4', '.webm', '.mkv', '.mp3', '.wav', '.flac', '.m3u8', '.mpd', '.ts', '.aac', '.m4a'];
    if (directMediaExts.includes(directExt)) {
      const probe = await ProbeService.probe(pageUrl).catch(() => null);
      const isHls = directExt === '.m3u8';
      const isDash = directExt === '.mpd';

      return {
        url: pageUrl,
        title: probe?.filename || path.basename(parsed.pathname) || 'Direct Media Stream',
        pageUrl,
        isProtected: false,
        formats: [
          {
            formatId: 'direct-original',
            ext: directExt.replace('.', ''),
            resolution: directExt === '.mp4' || directExt === '.webm' ? 'Original' : undefined,
            filesize: probe?.size && probe.size > 0 ? probe.size : undefined,
            isAudioOnly: ['.mp3', '.wav', '.flac', '.aac', '.m4a'].includes(directExt),
            isVideoOnly: false,
            url: pageUrl,
            protocol: isHls ? 'hls' : isDash ? 'dash' : 'http',
            qualityLabel: 'Original Quality',
          },
        ],
      };
    }

    // Fetch page HTML to extract media sources
    try {
      const html = await this.fetchHtml(pageUrl);
      return this.parseHtmlMedia(html, pageUrl);
    } catch (err: any) {
      return {
        url: pageUrl,
        title: 'Unknown Webpage',
        pageUrl,
        isProtected: false,
        formats: [],
        protectionReason: err.message,
      };
    }
  }

  private static async fetchHtml(targetUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 G1DM/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 10000,
        },
        (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
            res.headers.location
          ) {
            const redirect = new URL(res.headers.location, targetUrl).href;
            this.fetchHtml(redirect).then(resolve).catch(reject);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
            // Limit page read to 2MB
            if (data.length > 2 * 1024 * 1024) res.destroy();
          });
          res.on('end', () => resolve(data));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
    });
  }

  private static parseHtmlMedia(html: string, pageUrl: string): MediaDetectionResult {
    // Extract title
    let title = 'Detected Web Media';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // Extract OpenGraph / Twitter video
    const ogVideoMatch = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

    const discoveredUrls: { url: string; ext: string; isHls?: boolean; isAudio?: boolean }[] = [];

    if (ogVideoMatch && ogVideoMatch[1]) {
      try {
        const full = new URL(ogVideoMatch[1], pageUrl).href;
        discoveredUrls.push({ url: full, ext: path.extname(full).replace('.', '') || 'mp4' });
      } catch {}
    }

    // Find <video src="...">, <source src="...">, <audio src="...">
    const mediaTagRegex = /<(?:video|audio|source)[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = mediaTagRegex.exec(html)) !== null) {
      const rawSrc = match[1];
      if (!rawSrc) continue;
      try {
        const abs = new URL(rawSrc, pageUrl).href;
        const ext = path.extname(new URL(abs).pathname).toLowerCase().replace('.', '');
        const isHls = abs.includes('.m3u8') || ext === 'm3u8';
        const isAudio = match[0].toLowerCase().includes('<audio') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'opus'].includes(ext);
        discoveredUrls.push({ url: abs, ext: ext || (isHls ? 'm3u8' : 'mp4'), isHls, isAudio });
      } catch {}
    }

    // Check for DRM / Protected markers (Widevine, EME, EncryptedMedia)
    const isProtected =
      html.includes('com.widevine.alpha') ||
      html.includes('com.microsoft.playready') ||
      html.includes('encrypted-media');

    // Deduplicate discovered formats
    const uniqueFormats: MediaFormatOption[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < discoveredUrls.length; i++) {
      const item = discoveredUrls[i];
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      uniqueFormats.push({
        formatId: `format-${i + 1}`,
        ext: item.ext || 'mp4',
        url: item.url,
        protocol: item.isHls ? 'hls' : 'http',
        isAudioOnly: Boolean(item.isAudio),
        isVideoOnly: false,
        qualityLabel: item.isHls ? 'Adaptive HLS Stream' : `${item.ext.toUpperCase()} Media`,
      });
    }

    return {
      url: pageUrl,
      title,
      pageUrl,
      thumbnailUrl: ogImageMatch && ogImageMatch[1] ? ogImageMatch[1] : undefined,
      formats: uniqueFormats,
      isProtected,
      protectionReason: isProtected
        ? 'Download unavailable — source requires DRM encryption / session authorization.'
        : undefined,
    };
  }
}
