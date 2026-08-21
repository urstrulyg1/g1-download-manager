import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { TlsInspector, TlsInspectionResult } from '../engine/TlsInspector';
import { MediaManifestParser } from './MediaManifestParser';
import { DashManifestParser } from './DashManifestParser';
import { VideoInspector } from './VideoInspector';
import {
  VideoResolutionEngine,
  AnalyzedVideoQuality,
  AnalyzedAudioTrack,
} from './VideoResolutionEngine';
import { ProbeService } from '../engine/ProbeService';
import { TlsPolicy } from '../security/TlsPolicy';

export interface ComprehensiveMediaAnalysis {
  title: string;
  pageUrl: string;
  sourceUrl: string;
  deliveryType: 'HLS' | 'DASH' | 'DIRECT_HTTPS' | 'DIRECT_HTTP';
  tlsInfo: TlsInspectionResult;
  durationSec?: number;
  formattedDuration: string;
  thumbnailUrl?: string;
  isProtected: boolean;
  protectionReason?: string;
  availableVideoQualities: AnalyzedVideoQuality[];
  availableAudioTracks: AnalyzedAudioTrack[];
  recommendedQuality?: AnalyzedVideoQuality;
  isDownloadable: boolean;
}

export class SecureMediaDetector {
  public static async analyze(targetUrl: string, timeoutMs: number = 25000): Promise<ComprehensiveMediaAnalysis> {
    const parsed = new URL(targetUrl);
    const pathname = parsed.pathname.toLowerCase();

    // 1. Run TLS Inspection
    const tlsResult = await TlsInspector.inspectTls(targetUrl, 8000).catch(() => ({
      isHttps: targetUrl.startsWith('https:'),
      authorized: true,
      serverName: parsed.hostname,
      negotiatedAt: Date.now(),
    }));

    // 2. Direct HLS Stream (.m3u8)
    if (pathname.endsWith('.m3u8') || targetUrl.includes('.m3u8')) {
      return this.analyzeHlsManifest(targetUrl, targetUrl, tlsResult, timeoutMs);
    }

    // 3. Direct DASH Manifest (.mpd)
    if (pathname.endsWith('.mpd') || targetUrl.includes('.mpd')) {
      return this.analyzeDashManifest(targetUrl, targetUrl, tlsResult, timeoutMs);
    }

    // 4. Direct Video Files (.mp4, .webm, .mkv)
    const directExts = ['.mp4', '.webm', '.mkv', '.mov', '.ts', '.mp3', '.flac', '.wav', '.aac', '.m4a'];
    const ext = path.extname(pathname);
    if (directExts.includes(ext)) {
      return this.analyzeDirectMedia(targetUrl, targetUrl, tlsResult, timeoutMs);
    }

    // 5. Try real video extraction engine (yt-dlp) for YouTube, Vimeo, streaming platforms
    try {
      const ytAnalysis = await this.analyzeYtDlp(targetUrl, tlsResult, timeoutMs);
      if (ytAnalysis && ytAnalysis.availableVideoQualities.length > 0) {
        return ytAnalysis;
      }
    } catch {
      // Fall through to HTML webpage sniffer
    }

    // 6. Webpage HTML: Fetch and sniffer
    try {
      const html = await this.fetchText(targetUrl, timeoutMs);
      return this.analyzeWebpage(html, targetUrl, tlsResult, timeoutMs);
    } catch (err: any) {
      return {
        title: path.basename(parsed.pathname) || 'Media Stream',
        pageUrl: targetUrl,
        sourceUrl: targetUrl,
        deliveryType: targetUrl.startsWith('https:') ? 'DIRECT_HTTPS' : 'DIRECT_HTTP',
        tlsInfo: tlsResult,
        formattedDuration: 'Unknown',
        isProtected: false,
        isDownloadable: false,
        availableVideoQualities: [],
        availableAudioTracks: [],
        protectionReason: `Failed to inspect source: ${err.message}`,
      };
    }
  }

  private static getYtDlpBinary(): string {
    const candidates = [
      '/opt/homebrew/bin/yt-dlp',
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
    ];
    for (const bin of candidates) {
      if (fs.existsSync(bin)) return bin;
    }
    return 'yt-dlp';
  }

  public static async isYtDlpAvailable(): Promise<boolean> {
    const bin = this.getYtDlpBinary();
    return new Promise((resolve) => {
      execFile(bin, ['--version'], (err) => resolve(!err));
    });
  }

  private static async analyzeYtDlp(
    targetUrl: string,
    tlsResult: TlsInspectionResult,
    timeoutMs: number
  ): Promise<ComprehensiveMediaAnalysis | null> {
    if (!(await this.isYtDlpAvailable())) return null;

    try {
      const bin = this.getYtDlpBinary();
      const raw = await new Promise<string>((resolve, reject) => {
        execFile(
          bin,
          ['-J', '--no-warnings', '--no-playlist', targetUrl],
          { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          }
        );
      });

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }

      return this.parseYtDlpData(parsed, targetUrl, tlsResult);
    } catch {
      return null;
    }
  }

  public static parseYtDlpData(
    parsed: any,
    targetUrl: string,
    tlsResult?: TlsInspectionResult
  ): ComprehensiveMediaAnalysis | null {
    if (!parsed || !parsed.formats || !Array.isArray(parsed.formats)) {
      return null;
    }

    const title = parsed.title || path.basename(new URL(targetUrl).pathname) || 'Video Stream';
    const durationSec = typeof parsed.duration === 'number' ? parsed.duration : undefined;
    const thumbnailUrl =
      parsed.thumbnail ||
      (parsed.thumbnails && parsed.thumbnails.length > 0
        ? parsed.thumbnails[parsed.thumbnails.length - 1].url
        : undefined);

      const formats = parsed.formats;

      // 1. Audio-only tracks
      const audioFormats = formats.filter(
        (f: any) => f.vcodec === 'none' && f.acodec !== 'none' && f.format_note !== 'storyboard'
      );

      const m4aAudio = audioFormats
        .filter((f: any) => f.ext === 'm4a' || (f.acodec && f.acodec.includes('mp4a')))
        .sort((a: any, b: any) => (b.tbr || b.abr || 0) - (a.tbr || a.abr || 0))[0];

      const bestAudioOverall = [...audioFormats].sort(
        (a: any, b: any) => (b.tbr || b.abr || 0) - (a.tbr || a.abr || 0)
      )[0];

      const videoQualities: AnalyzedVideoQuality[] = [];
      const seenQualities = new Set<string>();

      // 2. Video streams
      const videoFormats = formats.filter(
        (f: any) => f.vcodec !== 'none' && f.format_note !== 'storyboard' && (f.height || f.width)
      );

      for (const f of videoFormats) {
        const height = f.height || (f.resolution ? parseInt(f.resolution.split('x')[1], 10) : 0) || 1080;
        const width = f.width || (f.resolution ? parseInt(f.resolution.split('x')[0], 10) : Math.round(height * (16 / 9)));
        const resLabel = VideoResolutionEngine.computeResolutionLabel(width, height);
        const fps = f.fps || 30;

        let vcodec = 'H.264 / AVC';
        if (f.vcodec?.startsWith('av01') || f.vcodec?.includes('av1')) vcodec = 'AV1';
        else if (f.vcodec?.startsWith('vp09') || f.vcodec?.startsWith('vp9')) vcodec = 'VP9';
        else if (f.vcodec?.startsWith('hev1') || f.vcodec?.startsWith('hvc1') || f.vcodec?.includes('hevc')) vcodec = 'HEVC / H.265';
        else if (f.vcodec?.startsWith('avc1') || f.vcodec?.includes('h264')) vcodec = 'H.264 / AVC';

        const isHdr = Boolean(
          f.dynamic_range === 'HDR' ||
          (f.vcodec && (f.vcodec.includes('hev1') || f.vcodec.includes('dvh1')))
        );

        const key = `${height}_${vcodec}_${fps}_${f.ext}`;
        if (seenQualities.has(key)) continue;
        seenQualities.add(key);

        const isVideoOnly = f.acodec === 'none';
        const companionAudio = isVideoOnly
          ? f.ext === 'webm'
            ? audioFormats.find((a: any) => a.ext === 'webm') || bestAudioOverall
            : m4aAudio || bestAudioOverall
          : undefined;

        const audioSize = companionAudio ? companionAudio.filesize || companionAudio.filesize_approx || 0 : 0;
        const rawVideoSize = f.filesize || f.filesize_approx || 0;
        let totalSizeBytes = rawVideoSize > 0 ? rawVideoSize + audioSize : 0;

        const bitrateBps =
          (f.tbr ? f.tbr * 1000 : f.vbr ? f.vbr * 1000 : 0) +
          (companionAudio?.tbr ? companionAudio.tbr * 1000 : 0);

        if (totalSizeBytes === 0 && bitrateBps > 0 && durationSec) {
          totalSizeBytes = Math.round((bitrateBps / 8) * durationSec);
        }

        const sizeEst = VideoResolutionEngine.estimateSize(
          bitrateBps,
          durationSec,
          totalSizeBytes > 0 ? totalSizeBytes : undefined
        );

        const formatSpec =
          isVideoOnly && companionAudio
            ? `${f.format_id}+${companionAudio.format_id}`
            : `${f.format_id}`;

        const container = f.ext === 'webm' ? 'WebM / MKV' : f.ext === 'mp4' ? 'MP4' : f.ext.toUpperCase();

        const qualityObj: AnalyzedVideoQuality = {
          id: `ytdlp_${f.format_id}`,
          resolutionLabel: resLabel,
          width,
          height,
          frameRate: fps,
          bitrateBps: bitrateBps || 5000000,
          bitrateFormatted: bitrateBps > 0 ? VideoResolutionEngine.formatBitrate(bitrateBps) : `${fps} fps`,
          videoCodec: vcodec,
          isHdr,
          hdrLabel: isHdr ? 'HDR10' : 'SDR',
          container,
          exactSizeBytes: totalSizeBytes > 0 ? totalSizeBytes : undefined,
          estimatedSizeBytes: sizeEst.sizeBytes,
          formattedSize: sizeEst.formatted,
          isEstimatedSize: sizeEst.isEstimated,
          downloadUrl: targetUrl,
          protocol: targetUrl.startsWith('https:') ? 'https' : 'http',
          isRecommended: false,
          recommendationScore: 0,
        };

        (qualityObj as any).formatSpec = formatSpec;
        qualityObj.recommendationScore = VideoResolutionEngine.scoreRecommendation(qualityObj);
        videoQualities.push(qualityObj);
      }

      // Audio Tracks
      const audioTracks: AnalyzedAudioTrack[] = audioFormats.map((a: any, idx: number) => {
        const abr = a.abr || a.tbr || 128;
        return {
          id: `audio_${a.format_id || idx}`,
          language: a.language || 'und',
          languageLabel:
            a.format_note ||
            (a.language === 'en' ? 'English' : a.language ? a.language.toUpperCase() : 'Original Audio'),
          audioCodec: (a.acodec || a.ext || 'AAC').toUpperCase(),
          bitrateBps: abr * 1000,
          bitrateFormatted: `${Math.round(abr)} kbps`,
          sampleRateHz: a.asr || 48000,
          channels: a.audio_channels || 2,
          downloadUrl: targetUrl,
        };
      });

      const sortedQualities = VideoResolutionEngine.sortQualities(videoQualities, 'RECOMMENDED');
      if (sortedQualities.length > 0) {
        sortedQualities[0].isRecommended = true;
      }

      return {
        title,
        pageUrl: targetUrl,
        sourceUrl: targetUrl,
        deliveryType: 'DIRECT_HTTPS',
        tlsInfo: tlsResult || {
          isHttps: targetUrl.startsWith('https:'),
          authorized: true,
          serverName: new URL(targetUrl).hostname,
          tlsVersion: 'TLSv1.3',
          cipher: 'TLS_AES_256_GCM_SHA384',
          negotiatedAt: Date.now(),
        },
        durationSec,
        formattedDuration: durationSec ? this.formatSeconds(durationSec) : 'Video Stream',
        thumbnailUrl,
        isProtected: false,
        isDownloadable: sortedQualities.length > 0,
        availableVideoQualities: sortedQualities,
        availableAudioTracks: audioTracks,
        recommendedQuality: sortedQualities[0],
      };
  }

  private static async analyzeHlsManifest(
    manifestUrl: string,
    pageUrl: string,
    tlsResult: TlsInspectionResult,
    timeoutMs: number
  ): Promise<ComprehensiveMediaAnalysis> {
    const text = await this.fetchText(manifestUrl, timeoutMs);
    const isMaster = MediaManifestParser.isMasterPlaylist(text);

    const videoQualities: AnalyzedVideoQuality[] = [];
    const audioTracks: AnalyzedAudioTrack[] = [];
    let isProtected = text.includes('#EXT-X-KEY:METHOD=SAMPLE-AES') || text.includes('#EXT-X-KEY:METHOD=com.apple.fps');

    if (isMaster) {
      const variants = MediaManifestParser.parseMasterPlaylist(text, manifestUrl);

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        let width = 1920;
        let height = 1080;

        if (v.resolution) {
          const parts = v.resolution.split('x').map((n) => parseInt(n, 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            width = parts[0];
            height = parts[1];
          }
        } else {
          if (v.bandwidth >= 10000000) { width = 3840; height = 2160; }
          else if (v.bandwidth >= 5000000) { width = 1920; height = 1080; }
          else if (v.bandwidth >= 2500000) { width = 1280; height = 720; }
          else { width = 854; height = 480; }
        }

        const resLabel = VideoResolutionEngine.computeResolutionLabel(width, height);
        const isHdr = Boolean(v.codecs && (v.codecs.includes('hev1') || v.codecs.includes('dvh1')));
        const sizeEst = VideoResolutionEngine.estimateSize(v.bandwidth, undefined);

        const qualityObj: AnalyzedVideoQuality = {
          id: `hls_var_${i + 1}`,
          resolutionLabel: resLabel,
          width,
          height,
          frameRate: v.frameRate || 30,
          bitrateBps: v.bandwidth,
          bitrateFormatted: VideoResolutionEngine.formatBitrate(v.bandwidth),
          videoCodec: v.codecs ? v.codecs.split(',')[0].trim() : 'H.264 / AVC',
          isHdr,
          hdrLabel: isHdr ? 'HDR10' : 'SDR',
          container: 'MP4 / HLS',
          estimatedSizeBytes: sizeEst.sizeBytes,
          formattedSize: sizeEst.formatted,
          isEstimatedSize: true,
          downloadUrl: v.url,
          protocol: 'hls',
          isRecommended: false,
          recommendationScore: 0,
        };

        qualityObj.recommendationScore = VideoResolutionEngine.scoreRecommendation(qualityObj);
        videoQualities.push(qualityObj);
      }
    } else {
      const segments = MediaManifestParser.parseMediaPlaylist(text, manifestUrl);
      const totalDur = segments.reduce((sum, s) => sum + s.durationSec, 0);

      videoQualities.push({
        id: 'hls_single',
        resolutionLabel: 'Original Quality',
        width: 1920,
        height: 1080,
        bitrateBps: 4500000,
        bitrateFormatted: 'Adaptive Bitrate',
        videoCodec: 'H.264 / AVC',
        isHdr: false,
        hdrLabel: 'SDR',
        container: 'MPEG-TS / HLS',
        estimatedSizeBytes: Math.round((4500000 / 8) * (totalDur || 60)),
        formattedSize: totalDur > 0 ? `~${VideoResolutionEngine.formatBytes((4500000 / 8) * totalDur)}` : 'Variable Stream',
        isEstimatedSize: true,
        downloadUrl: manifestUrl,
        protocol: 'hls',
        isRecommended: true,
        recommendationScore: 90,
      });
    }

    const sortedQualities = VideoResolutionEngine.sortQualities(videoQualities, 'RECOMMENDED');
    if (sortedQualities.length > 0) sortedQualities[0].isRecommended = true;

    return {
      title: path.basename(new URL(manifestUrl).pathname, '.m3u8') || 'HLS Video Stream',
      pageUrl,
      sourceUrl: manifestUrl,
      deliveryType: 'HLS',
      tlsInfo: tlsResult,
      formattedDuration: 'Adaptive Stream',
      isProtected,
      protectionReason: isProtected ? 'Stream uses FairPlay / AES-128 sample encryption.' : undefined,
      isDownloadable: !isProtected,
      availableVideoQualities: sortedQualities,
      availableAudioTracks: audioTracks,
      recommendedQuality: sortedQualities[0],
    };
  }

  private static async analyzeDashManifest(
    mpdUrl: string,
    pageUrl: string,
    tlsResult: TlsInspectionResult,
    timeoutMs: number
  ): Promise<ComprehensiveMediaAnalysis> {
    const xml = await this.fetchText(mpdUrl, timeoutMs);
    const parsed = DashManifestParser.parse(xml, mpdUrl);

    const videoQualities: AnalyzedVideoQuality[] = parsed.videoRepresentations.map((v, i) => {
      const sizeEst = VideoResolutionEngine.estimateSize(v.bandwidth, parsed.durationSec);
      const q: AnalyzedVideoQuality = {
        id: `dash_rep_${v.id || i}`,
        resolutionLabel: v.qualityLabel,
        width: v.width,
        height: v.height,
        frameRate: v.frameRate || 30,
        bitrateBps: v.bandwidth,
        bitrateFormatted: VideoResolutionEngine.formatBitrate(v.bandwidth),
        videoCodec: v.codecs || 'H.264 / AVC',
        isHdr: v.isHdr,
        hdrLabel: v.isHdr ? 'HDR10' : 'SDR',
        container: 'MP4 / DASH',
        estimatedSizeBytes: sizeEst.sizeBytes,
        formattedSize: sizeEst.formatted,
        isEstimatedSize: true,
        downloadUrl: mpdUrl,
        protocol: 'dash',
        isRecommended: false,
        recommendationScore: 0,
      };
      q.recommendationScore = VideoResolutionEngine.scoreRecommendation(q);
      return q;
    });

    const audioTracks: AnalyzedAudioTrack[] = parsed.audioRepresentations.map((a, i) => ({
      id: `dash_audio_${a.id || i}`,
      language: a.language || 'und',
      languageLabel: a.language === 'en' ? 'English' : a.language || 'Default Audio',
      audioCodec: a.codecs || 'AAC',
      bitrateBps: a.bandwidth,
      bitrateFormatted: VideoResolutionEngine.formatBitrate(a.bandwidth),
      sampleRateHz: a.audioSamplingRate || 48000,
      channels: 2,
      downloadUrl: mpdUrl,
    }));

    const sortedQualities = VideoResolutionEngine.sortQualities(videoQualities, 'RECOMMENDED');
    if (sortedQualities.length > 0) sortedQualities[0].isRecommended = true;

    return {
      title: path.basename(new URL(mpdUrl).pathname, '.mpd') || 'DASH Media Manifest',
      pageUrl,
      sourceUrl: mpdUrl,
      deliveryType: 'DASH',
      tlsInfo: tlsResult,
      durationSec: parsed.durationSec,
      formattedDuration: parsed.durationSec ? this.formatSeconds(parsed.durationSec) : 'DASH Stream',
      isProtected: parsed.isProtected,
      protectionReason: parsed.isProtected
        ? `Protected with ${parsed.drmSchemes.join(', ') || 'DRM'}. Cannot bypass technical access control.`
        : undefined,
      isDownloadable: !parsed.isProtected,
      availableVideoQualities: sortedQualities,
      availableAudioTracks: audioTracks,
      recommendedQuality: sortedQualities[0],
    };
  }

  private static async analyzeDirectMedia(
    mediaUrl: string,
    pageUrl: string,
    tlsResult: TlsInspectionResult,
    timeoutMs: number
  ): Promise<ComprehensiveMediaAnalysis> {
    const probe = await ProbeService.probe(mediaUrl, undefined, undefined, timeoutMs).catch(() => null);
    const meta = await VideoInspector.inspectRemoteHeader(mediaUrl, timeoutMs);

    const width = meta.width || 1920;
    const height = meta.height || 1080;
    const resLabel = VideoResolutionEngine.computeResolutionLabel(width, height);
    const sizeBytes = probe?.size && probe.size > 0 ? probe.size : undefined;

    const quality: AnalyzedVideoQuality = {
      id: 'direct_orig',
      resolutionLabel: resLabel,
      width,
      height,
      frameRate: 30,
      bitrateBps: 6000000,
      bitrateFormatted:
        sizeBytes && meta.durationSec
          ? VideoResolutionEngine.formatBitrate(Math.round((sizeBytes * 8) / meta.durationSec))
          : 'Direct Stream',
      videoCodec: meta.videoCodec || 'H.264 / AVC',
      isHdr: false,
      hdrLabel: 'SDR',
      container: meta.container !== 'Unknown' ? meta.container : 'MP4',
      exactSizeBytes: sizeBytes,
      formattedSize: sizeBytes ? VideoResolutionEngine.formatBytes(sizeBytes) : 'Direct File',
      isEstimatedSize: false,
      downloadUrl: mediaUrl,
      protocol: mediaUrl.startsWith('https:') ? 'https' : 'http',
      isRecommended: true,
      recommendationScore: 100,
    };

    return {
      title: probe?.filename || path.basename(new URL(mediaUrl).pathname) || 'Direct Video File',
      pageUrl,
      sourceUrl: mediaUrl,
      deliveryType: mediaUrl.startsWith('https:') ? 'DIRECT_HTTPS' : 'DIRECT_HTTP',
      tlsInfo: tlsResult,
      durationSec: meta.durationSec,
      formattedDuration: meta.durationSec ? this.formatSeconds(meta.durationSec) : 'Direct Media',
      isProtected: false,
      isDownloadable: true,
      availableVideoQualities: [quality],
      availableAudioTracks: [
        {
          id: 'audio_direct',
          language: 'und',
          languageLabel: 'Embedded Audio',
          audioCodec: meta.audioCodec || 'AAC',
          bitrateBps: 192000,
          bitrateFormatted: '192 kbps',
          sampleRateHz: 48000,
          channels: 2,
          downloadUrl: mediaUrl,
        },
      ],
      recommendedQuality: quality,
    };
  }

  private static async analyzeWebpage(
    html: string,
    pageUrl: string,
    tlsResult: TlsInspectionResult,
    timeoutMs: number
  ): Promise<ComprehensiveMediaAnalysis> {
    let title = 'Webpage Media';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    const hlsMatch = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (hlsMatch) {
      const res = await this.analyzeHlsManifest(hlsMatch[0], pageUrl, tlsResult, timeoutMs);
      if (title && title !== 'Webpage Media') res.title = title;
      return res;
    }

    const dashMatch = html.match(/https?:\/\/[^\s"'<>]+\.mpd[^\s"'<>]*/i);
    if (dashMatch) {
      const res = await this.analyzeDashManifest(dashMatch[0], pageUrl, tlsResult, timeoutMs);
      if (title && title !== 'Webpage Media') res.title = title;
      return res;
    }

    const directVideoMatch = html.match(
      /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|mkv)[^"']*)["']/i
    );
    if (directVideoMatch && directVideoMatch[1]) {
      const fullUrl = new URL(directVideoMatch[1], pageUrl).href;
      const res = await this.analyzeDirectMedia(fullUrl, pageUrl, tlsResult, timeoutMs);
      if (title && title !== 'Webpage Media') res.title = title;
      return res;
    }

    const isProtected = html.includes('com.widevine.alpha') || html.includes('encrypted-media');

    return {
      title,
      pageUrl,
      sourceUrl: pageUrl,
      deliveryType: 'DIRECT_HTTPS',
      tlsInfo: tlsResult,
      formattedDuration: 'Unknown',
      isProtected,
      protectionReason: isProtected
        ? 'DRM Encrypted stream detected in webpage.'
        : 'No openly accessible video streams found in raw webpage HTML.',
      isDownloadable: false,
      availableVideoQualities: [],
      availableAudioTracks: [],
    };
  }

  private static formatSeconds(totalSec: number): string {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = Math.floor(totalSec % 60);

    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  private static async fetchText(targetUrl: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(
        targetUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 G1DM/1.0',
            Accept: '*/*',
          },
          timeout: timeoutMs,
          rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
        },
        (res) => {
          if (
            (res.statusCode === 301 ||
              res.statusCode === 302 ||
              res.statusCode === 307 ||
              res.statusCode === 308) &&
            res.headers.location
          ) {
            const redirect = new URL(res.headers.location, targetUrl).href;
            this.fetchText(redirect, timeoutMs).then(resolve).catch(reject);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} loading resource`));
            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
    });
  }
}
