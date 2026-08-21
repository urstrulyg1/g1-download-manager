import * as fs from 'fs';
import * as path from 'path';
import { PlaylistBatchGrabber } from '../src/main/media/PlaylistBatchGrabber';
import { LiveStreamDVR } from '../src/main/media/LiveStreamDVR';
import { MultiTrackExtractor } from '../src/main/media/MultiTrackExtractor';
import { MediaTranscoder } from '../src/main/media/MediaTranscoder';
import { MetadataInjector } from '../src/main/media/MetadataInjector';
import { ChannelBonding } from '../src/main/network/ChannelBonding';
import { TorrentEngine } from '../src/main/engine/TorrentEngine';
import { DualStackSelector } from '../src/main/network/DualStackSelector';
import { LatencySense } from '../src/main/network/LatencySense';
import { WebhookTrigger } from '../src/main/automation/WebhookTrigger';
import { AutoExtractor } from '../src/main/archive/AutoExtractor';
import { DebridManager } from '../src/main/debrid/DebridManager';
import { CloudSyncManager } from '../src/main/storage/CloudSyncManager';
import { DropBoxWatcher } from '../src/main/storage/DropBoxWatcher';
import { EncryptedVault } from '../src/main/security/EncryptedVault';
import { ControlBot } from '../src/main/remote/ControlBot';
import { AppDatabase } from '../src/main/db/Database';
import { DownloadEngine } from '../src/main/engine/DownloadEngine';

describe('G1DM Master Power Features Suite', () => {
  let db: AppDatabase;
  let engine: DownloadEngine;
  const tempDir = path.join(__dirname, 'tmp_power_features');

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

  describe('1. Media & Streaming Superpowers', () => {
    it('should parse playlist and enqueue multi-threaded batch items', async () => {
      const parsed = await PlaylistBatchGrabber.parsePlaylist('https://youtube.com/playlist?list=PL123');
      expect(parsed.totalTracks).toBeGreaterThan(0);
      expect(parsed.tracks[0].filename).toContain('Track_01');

      const ids = await PlaylistBatchGrabber.enqueuePlaylist(parsed, engine, tempDir);
      expect(ids.length).toBe(parsed.totalTracks);
    });

    it('should schedule and manage live stream DVR recording', async () => {
      const rec = LiveStreamDVR.scheduleRecording({
        streamUrl: 'https://example.com/live/stream.m3u8',
        title: 'Twitch Championship Stream',
        startTimeEpochMs: Date.now() + 100000,
        durationSec: 60,
        outputFilename: 'dvr_stream.mp4',
      });
      expect(rec.status).toBe('scheduled');

      const all = LiveStreamDVR.getAllRecordings();
      expect(all.some((r) => r.id === rec.id)).toBe(true);

      const cancelled = await LiveStreamDVR.cancelRecording(rec.id);
      expect(cancelled).toBe(true);
    });

    it('should extract audio and subtitle tracks from stream manifest', async () => {
      const tracks = await MultiTrackExtractor.extractTracks('https://example.com/stream.m3u8');
      expect(tracks.audioTracks.length).toBeGreaterThan(0);
      expect(tracks.subtitleTracks.length).toBeGreaterThan(0);
      expect(tracks.audioTracks.some((a) => a.language === 'en')).toBe(true);
    });

    it('should perform in-engine media transcoding and trimming', async () => {
      const testFile = path.join(tempDir, 'sample_video.mp4');
      fs.writeFileSync(testFile, Buffer.from('dummy mp4 video bytes'));

      const result = await MediaTranscoder.transcode({
        sourceFilePath: testFile,
        outputFormat: 'mkv',
        startSec: 10,
        endSec: 30,
      });

      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('_transcoded.mkv');
      expect(result.durationSec).toBe(20);
    });

    it('should inject metadata into media files', async () => {
      const testFile = path.join(tempDir, 'metadata_video.mp4');
      fs.writeFileSync(testFile, Buffer.from('dummy mp4 bytes'));

      const injected = await MetadataInjector.injectMetadata(testFile, {
        title: 'G1DM Super Stream',
        artist: 'Media Engine',
        chapters: [{ startTimeSec: 0, title: 'Intro' }],
      });
      expect(injected).toBe(true);
    });
  });

  describe('2. Speed, Network & Protocol Multipliers', () => {
    it('should detect network adapters for channel bonding', () => {
      const adapters = ChannelBonding.detectAdapters();
      expect(Array.isArray(adapters)).toBe(true);
    });

    it('should parse magnet URIs and add accelerated torrent downloads', () => {
      const status = TorrentEngine.addTorrent('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Ubuntu_Linux_ISO');
      expect(status.name).toContain('Ubuntu_Linux_ISO');
      expect(status.webSeedAccelerated).toBe(true);

      const list = TorrentEngine.getAllTorrents();
      expect(list.length).toBeGreaterThan(0);
    });

    it('should select optimal dual-stack IPv4/IPv6 address', async () => {
      const selected = await DualStackSelector.selectOptimalFamily('localhost');
      expect(['IPv4', 'IPv6']).toContain(selected.selectedFamily);
    });

    it('should adjust speed limits using Latency Sense ping monitoring', () => {
      LatencySense.setEnabled(true);
      LatencySense.setThreshold(50);

      const highPingThrottled = LatencySense.updatePing(120, engine);
      expect(highPingThrottled).toBe(true);

      const lowPingRestored = LatencySense.updatePing(20, engine);
      expect(lowPingRestored).toBe(false);
    });
  });

  describe('3. Automation & Webhook Triggers', () => {
    it('should execute webhook triggers and script callbacks', async () => {
      const dummyItem = await engine.addDownload({ url: 'https://example.com/test.zip', startImmediately: false });
      dummyItem.status = 'completed';

      const result = await WebhookTrigger.executeTriggers(dummyItem, {
        enabled: true,
        triggerOnComplete: true,
        triggerOnError: false,
      });

      expect(typeof result).toBe('object');
    });

    it('should reject corrupt archives instead of fabricating extraction results', async () => {
      // Regression guard: the extractor previously "succeeded" on garbage bytes
      // by writing a dummy file. Real extraction must fail gracefully here.
      const archivePath = path.join(tempDir, 'test_archive.zip');
      fs.writeFileSync(archivePath, Buffer.from('dummy zip file content'));

      const result = await AutoExtractor.extractArchive(archivePath, ['secret123'], false);
      expect(result.extracted).toBe(false);
      expect(result.extractedFiles.length).toBe(0);
    });

    it('should auto-extract real gzip archives', async () => {
      const zlib = require('zlib');
      const gzPath = path.join(tempDir, 'real_data.txt.gz');
      fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from('real extraction works')));

      const result = await AutoExtractor.extractArchive(gzPath, [], false);
      expect(result.extracted).toBe(true);
      expect(result.extractedFiles.length).toBe(1);
      expect(fs.readFileSync(result.extractedFiles[0], 'utf8')).toBe('real extraction works');
    });
  });

  describe('4. Cloud, Debrid & Drop-Box Integrations', () => {
    it('should configure Debrid account and unrestrict hoster links', async () => {
      DebridManager.addAccount({
        provider: 'real-debrid',
        apiKey: 'rd_test_key_123',
        isPremium: true,
      });

      const unrestricted = await DebridManager.unrestrictLink('https://rapidgator.net/file/123/file.zip');
      expect(unrestricted.downloadUrl).toContain('debrid_token=rd_test_key_123');
    });

    it('should upload completed file to local NAS or Cloud target', async () => {
      const filePath = path.join(tempDir, 'nas_upload.bin');
      fs.writeFileSync(filePath, Buffer.from('data to sync'));

      const nasPath = path.join(tempDir, 'nas_destination');
      const result = await CloudSyncManager.uploadToCloud(filePath, {
        provider: 'local_nas',
        config: { nasPath },
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(result.remotePath)).toBe(true);
    });

    it('should process drop-box link files automatically', async () => {
      const dropFile = path.join(tempDir, 'links.urls');
      fs.writeFileSync(dropFile, 'https://example.com/file1.iso\nhttps://example.com/file2.zip');

      const count = await DropBoxWatcher.processDropFile(dropFile, engine);
      expect(count).toBe(2);
    });
  });

  describe('5. Hardware-Encrypted Vault', () => {
    it('should lock, unlock, store encrypted file, and export decrypted file', async () => {
      const sourceFile = path.join(tempDir, 'sensitive_doc.txt');
      fs.writeFileSync(sourceFile, Buffer.from('Confidential Vault Data 123'));

      EncryptedVault.unlockVault('master_password_99');
      expect(EncryptedVault.isVaultUnlocked()).toBe(true);

      const vaultItem = await EncryptedVault.encryptAndStoreFile(sourceFile);
      expect(fs.existsSync(vaultItem.vaultFilePath)).toBe(true);

      const exportDir = path.join(tempDir, 'vault_export');
      fs.mkdirSync(exportDir, { recursive: true });

      const exportedPath = await EncryptedVault.decryptAndExportFile(vaultItem.id, exportDir);
      expect(fs.readFileSync(exportedPath, 'utf-8')).toBe('Confidential Vault Data 123');

      EncryptedVault.lockVault();
      expect(EncryptedVault.isVaultUnlocked()).toBe(false);
    });
  });

  describe('6. Telegram & Discord Control Bot', () => {
    it('should execute bot commands for remote queue management', async () => {
      ControlBot.configure({ enabled: true });

      const addRes = await ControlBot.processCommand('/add https://example.com/bot_download.mp4', engine);
      expect(addRes.responseText).toContain('Enqueued download');

      const statusRes = await ControlBot.processCommand('/status', engine);
      expect(statusRes.responseText).toContain('Queue');
      expect(statusRes.responseText).toContain('bot_download.mp4');

      const pauseRes = await ControlBot.processCommand('/pause', engine);
      expect(pauseRes.responseText).toContain('paused');

      const resumeRes = await ControlBot.processCommand('/resume', engine);
      expect(resumeRes.responseText).toContain('resumed');
    });
  });
});
