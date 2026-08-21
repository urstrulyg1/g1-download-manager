import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';
import { SecureMediaDetector } from '../src/main/media/SecureMediaDetector';
import { MediaStreamDownloader } from '../src/main/media/MediaStreamDownloader';
import { PathSanitizer } from '../src/main/storage/PathSanitizer';
import { DownloadItem } from '../src/shared/types';

describe('Real Video Download Pipeline & IDM Engine Suite', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;
  const tempDir = path.join(__dirname, 'tmp_media_test');

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    db = new AppDatabase(':memory:');
    await db.init();
    engine = new DownloadEngine(db);
    await engine.init();
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('1. Filename & Metadata Sanitation', () => {
    it('should cleanly sanitize real song titles without adding technical metadata or losing Unicode', () => {
      const rawTitle = 'Ma Ma Mahesha - 8K Video Song | Sarkaru Vaari Paata | Mahesh Babu | Keerthy Suresh | Thaman S';
      const sanitized = PathSanitizer.sanitizeFilename(`${rawTitle}.mp4`);
      
      expect(sanitized).toContain('Ma Ma Mahesha - 8K Video Song _ Sarkaru Vaari Paata _ Mahesh Babu _ Keerthy Suresh _ Thaman S.mp4');
      expect(sanitized).not.toContain('YouTube_8K_HEVC_HEVC');
      expect(sanitized).not.toContain('31');
    });

    it('should resolve collision with clean numbering without mangling title', () => {
      const testFile = path.join(tempDir, 'Video_Track.mp4');
      fs.writeFileSync(testFile, 'dummy data');

      const resolved = (engine as any).resolveFileCollision(tempDir, 'Video_Track.mp4', 'rename');
      expect(resolved).toBe(path.join(tempDir, 'Video_Track (1).mp4'));

      fs.unlinkSync(testFile);
    });
  });

  describe('2. MediaStreamDownloader Line Parser & Telemetry', () => {
    it('should parse yt-dlp stdout progress lines and extract percentage, speed, and ETA', () => {
      const item: DownloadItem = {
        id: 'test_media_1',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        filename: 'Rick_Roll.mp4',
        destinationDir: tempDir,
        finalPath: path.join(tempDir, 'Rick_Roll.mp4'),
        tempPath: path.join(tempDir, 'Rick_Roll.mp4.part'),
        stateFilePath: path.join(tempDir, 'Rick_Roll.mp4.g1dm'),
        status: 'downloading',
        totalBytes: 0,
        downloadedBytes: 0,
        progress: 0,
        speed: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        eta: 0,
        category: 'video',
        queueId: 'default',
        priority: 'normal',
        maxConnections: 8,
        activeConnections: 0,
        speedLimitBytesPerSec: 0,
        segments: [],
        speedHistory: [],
        checksum: { algorithm: 'sha256', status: 'none' },
        serverCapabilities: {
          supportsRange: true,
          redirectChain: [],
          protocol: 'https',
          authRequired: false,
          probedAt: Date.now(),
        },
        error: null,
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        durationMs: 0,
        securityScan: { status: 'unsupported' },
        logs: [],
      };

      const downloader = new MediaStreamDownloader(item);

      // Simulate custom progress line emitted by yt-dlp wrapper
      downloader.parseOutputLine(
        'download: 45.2% | 120.50MiB | 250.00MiB | 15.20MiB/s | 00:04 | 1000'
      );

      expect(item.progress).toBeCloseTo(45.2, 1);
      expect(item.speed).toBeGreaterThan(15 * 1024 * 1024);
      expect(item.eta).toBe(4);
      expect((item as any).phase).toBe('downloading');

      // Simulate merger line
      downloader.parseOutputLine(
        '[Merger] Merging formats into "Rick_Roll.mp4"'
      );
      expect((item as any).phase).toBe('merging');
      expect((item as any).statusMessage).toContain('Muxing');
    });

    it('should reject tiny payloads <= 100 bytes during validation', () => {
      const smallFile = path.join(tempDir, 'small_dummy.mp4');
      fs.writeFileSync(smallFile, 'HTTP 403 Forbidden Error Page Payload');

      const item: DownloadItem = {
        id: 'test_small',
        url: 'https://example.com/small.mp4',
        filename: 'small_dummy.mp4',
        destinationDir: tempDir,
        finalPath: smallFile,
        tempPath: `${smallFile}.part`,
        stateFilePath: `${smallFile}.g1dm`,
        status: 'downloading',
        totalBytes: 31,
        downloadedBytes: 31,
        progress: 100,
        speed: 0,
        avgSpeed: 0,
        peakSpeed: 0,
        eta: 0,
        category: 'video',
        queueId: 'default',
        priority: 'normal',
        maxConnections: 1,
        activeConnections: 0,
        speedLimitBytesPerSec: 0,
        segments: [],
        speedHistory: [],
        checksum: { algorithm: 'sha256', status: 'none' },
        serverCapabilities: {
          supportsRange: false,
          redirectChain: [],
          protocol: 'https',
          authRequired: false,
          probedAt: Date.now(),
        },
        error: null,
        retryCount: 0,
        maxRetries: 1,
        createdAt: Date.now(),
        durationMs: 0,
        securityScan: { status: 'unsupported' },
        logs: [],
      };

      const downloader = new MediaStreamDownloader(item);
      expect(() => downloader.validateFileIntegrity(smallFile)).toThrow(/Payload too small/);

      fs.unlinkSync(smallFile);
    });
  });

  describe('3. SecureMediaDetector yt-dlp Format Extraction', () => {
    it('should parse yt-dlp metadata JSON correctly into video and audio qualities', () => {
      const mockYtDlpJson = {
        title: 'Ma Ma Mahesha - 8K Video Song | Sarkaru Vaari Paata | Mahesh Babu | Keerthy Suresh | Thaman S',
        thumbnail: 'https://i.ytimg.com/vi/test/maxresdefault.jpg',
        duration: 254,
        formats: [
          {
            format_id: '571',
            ext: 'mp4',
            width: 7680,
            height: 4320,
            vcodec: 'av01.0.19M.08',
            acodec: 'none',
            tbr: 25000,
            filesize: 850000000,
            fps: 60,
            protocol: 'https',
          },
          {
            format_id: '313',
            ext: 'webm',
            width: 3840,
            height: 2160,
            vcodec: 'vp9',
            acodec: 'none',
            tbr: 14000,
            filesize: 420000000,
            fps: 60,
            protocol: 'https',
          },
          {
            format_id: '137',
            ext: 'mp4',
            width: 1920,
            height: 1080,
            vcodec: 'avc1.640028',
            acodec: 'none',
            tbr: 4500,
            filesize: 140000000,
            fps: 30,
            protocol: 'https',
          },
          {
            format_id: '251',
            ext: 'webm',
            vcodec: 'none',
            acodec: 'opus',
            abr: 160,
            filesize: 5200000,
            protocol: 'https',
          },
          {
            format_id: '140',
            ext: 'm4a',
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            abr: 128,
            filesize: 4100000,
            protocol: 'https',
          },
        ],
      };

      const parsed = SecureMediaDetector.parseYtDlpData(
        mockYtDlpJson,
        'https://www.youtube.com/watch?v=sample'
      )!;

      expect(parsed.title).toBe('Ma Ma Mahesha - 8K Video Song | Sarkaru Vaari Paata | Mahesh Babu | Keerthy Suresh | Thaman S');
      expect(parsed.thumbnailUrl).toBe('https://i.ytimg.com/vi/test/maxresdefault.jpg');
      expect(parsed.durationSec).toBe(254);
      expect(parsed.availableVideoQualities.length).toBe(3);

      // Verify 8K quality
      const quality8K = parsed.availableVideoQualities.find((q: any) => q.resolutionLabel === '4320p (8K)' || q.height === 4320);
      expect(quality8K).toBeDefined();
      expect(quality8K!.videoCodec).toContain('AV1');
      expect(quality8K!.exactSizeBytes).toBe(854100000);

      // Verify audio tracks
      expect(parsed.availableAudioTracks.length).toBe(2);
      expect(parsed.availableAudioTracks.some((a: any) => a.audioCodec.toLowerCase().includes('opus'))).toBe(true);
    });
  });
});
