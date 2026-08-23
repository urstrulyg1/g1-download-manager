import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import next from 'next';
import { AppDatabase } from './db/Database';
import { DownloadEngine } from './engine/DownloadEngine';
import { ProbeService } from './engine/ProbeService';
import { SchedulerService } from './scheduler/SchedulerService';
import { StorageManager } from './storage/StorageManager';
import { DiagnosticsService } from './diagnostics/DiagnosticsService';
import { MediaDetector } from './media/MediaDetector';
import { LinkBatchExtractor } from './batch/LinkBatchExtractor';
import { SiteGrabber } from './grabber/SiteGrabber';
import { ArchiveInspector } from './archive/ArchiveInspector';
import { SecurityScanner } from './security/SecurityScanner';
import { BrowserIntegrationService } from './browser/BrowserIntegrationService';
import { ClipboardMonitor } from './clipboard/ClipboardMonitor';
import { SystemMetrics } from '../shared/types';

// Supercharged Modules
import { PlaylistBatchGrabber } from './media/PlaylistBatchGrabber';
import { LiveStreamDVR } from './media/LiveStreamDVR';
import { MultiTrackExtractor } from './media/MultiTrackExtractor';
import { MediaTranscoder } from './media/MediaTranscoder';
import { MetadataInjector } from './media/MetadataInjector';
import { ChannelBonding } from './network/ChannelBonding';
import { TorrentEngine } from './engine/TorrentEngine';
import { DualStackSelector } from './network/DualStackSelector';
import { LatencySense } from './network/LatencySense';
import { WebhookTrigger } from './automation/WebhookTrigger';
import { AutoExtractor } from './archive/AutoExtractor';
import { DebridManager } from './debrid/DebridManager';
import { CloudSyncManager } from './storage/CloudSyncManager';
import { DropBoxWatcher } from './storage/DropBoxWatcher';
import { EncryptedVault } from './security/EncryptedVault';
import { ControlBot } from './remote/ControlBot';
import { ThreatIntelService } from './security/ThreatIntelService';
import { PowerGovernor } from './platform/PowerGovernor';
import { TlsPolicy } from './security/TlsPolicy';
import { RequestAuth } from './security/RequestAuth';
import { UrlGuard } from './security/UrlGuard';
import { PathGuard } from './security/PathGuard';
import { redactSettings } from './security/Redact';

export async function createUnifiedServer(port: number = 8055) {
  const rendererDir = path.join(process.cwd(), 'src', 'renderer');
  const hasProductionBuild = fs.existsSync(path.join(rendererDir, '.next', 'BUILD_ID'));
  const isDev = process.env.NODE_ENV === 'development' || (!hasProductionBuild && process.env.NODE_ENV !== 'production');

  const nextApp = next({ dev: isDev, dir: rendererDir });
  const nextHandler = nextApp.getRequestHandler();

  await nextApp.prepare();

  const db = new AppDatabase();
  await db.init();

  const engine = new DownloadEngine(db);
  await engine.init();

  const scheduler = new SchedulerService(db, engine);
  scheduler.start();

  const grabber = new SiteGrabber(db, engine);
  const clipboardMonitor = new ClipboardMonitor();
  BrowserIntegrationService.ensureExtensionFiles();

  // Configure remote-control bot and power governor from persisted settings
  const applyRemoteAndPowerSettings = () => {
    const s = db.getSettings();
    // Keep the TLS verification policy in sync with user settings.
    TlsPolicy.setVerifySslCertificates(s.security?.verifySslCertificates !== false);
    // Seed the path-traversal guard with all legitimate destination roots.
    const allowedRoots = new Set<string>([s.general?.defaultDownloadDir]);
    db.getCategories().forEach((c) => c.defaultDestination && allowedRoots.add(c.defaultDestination));
    db.getQueues().forEach((q) => q.destinationDir && allowedRoots.add(q.destinationDir));
    PathGuard.setAllowedRoots(Array.from(allowedRoots));
    ControlBot.configure(
      {
        enabled: s.remote?.telegramBotEnabled || !!s.remote?.discordWebhookUrl,
        telegramBotToken: s.remote?.telegramBotEnabled ? s.remote.telegramBotToken : undefined,
        telegramAllowedChatIds: s.remote?.telegramAllowedChatIds || [],
        discordWebhookUrl: s.remote?.discordWebhookUrl || undefined,
      },
      engine
    );
  };
  applyRemoteAndPowerSettings();
  PowerGovernor.start(engine, db, (message) => broadcastLater('power_governor', { message }));

  // broadcast() is defined below; buffer via indirection so PowerGovernor can be started here.
  let broadcastRef: ((type: string, data: any) => void) | null = null;
  function broadcastLater(type: string, data: any) {
    if (broadcastRef) broadcastRef(type, data);
  }

  const app = express();
  app.use(
    cors({
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        // No Origin header (curl, native host, same-host service workers).
        if (!origin) return cb(null, true);
        // Browser companion extensions (Chrome, Firefox, Safari).
        if (/^(chrome|moz|safari-web)-extension:\/\//.test(origin)) return cb(null, true);
        // Local / loopback origins.
        if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)) return cb(null, true);
        // Same-origin app (LAN / preview) — reflect the request origin.
        return cb(null, false);
      },
    })
  );
  app.use(express.json({ limit: '10mb' }));

  // Transparently rewrite /api/v1/* calls to /api/* for backward & future API version compatibility
  app.use((req, _res, next) => {
    if (req.url.startsWith('/api/v1/')) {
      req.url = req.url.replace('/api/v1/', '/api/');
    }
    next();
  });

  // Authentication for the control plane (optional user-defined token)
  RequestAuth.setApiKeyProvider(() => db.getSettings().security?.apiKey || undefined);
  app.use(RequestAuth.middleware());

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    // Apply the same remote-access policy to WebSocket upgrades.
    const remote = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const isLoopback = remote === '127.0.0.1' || remote === '::1';
    if (!isLoopback && RequestAuth.isRemoteAuthEnabled()) {
      const header = req.headers['authorization'] || req.headers['x-g1dm-key'];
      const supplied = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '').trim() : '';
      if (!RequestAuth.isValidKey(supplied)) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
  });

  const broadcast = (type: string, data: any) => {
    const payload = JSON.stringify({ type, data });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };
  broadcastRef = broadcast;

  // Attach engine events to WebSocket broadcast
  engine.on('item_progress', (item) => broadcast('item_progress', item));
  engine.on('item_added', (item) => broadcast('item_added', item));
  engine.on('item_updated', (item) => broadcast('item_updated', item));
  engine.on('item_completed', (item) => {
    broadcast('item_completed', item);
    const settings = db.getSettings();

    // Antivirus scan
    if (settings.security.runAntivirusScan) {
      SecurityScanner.scanFile(item.finalPath, settings.security.antivirusCommand);
    }

    // Post-download webhooks & custom scripts (now driven by user settings)
    if (settings.automation?.webhooksEnabled) {
      WebhookTrigger.executeTriggers(item, {
        enabled: true,
        webhookUrl: settings.automation.webhookUrl || undefined,
        customScriptPath: settings.automation.customScriptPath || undefined,
        triggerOnComplete: settings.automation.triggerOnComplete,
        triggerOnError: settings.automation.triggerOnError,
      });
    }

    // Automated archive extraction with password dictionary
    if (settings.automation?.autoExtractArchives && /\.(zip|rar|7z|gz|tgz|tar)$/i.test(item.finalPath || '')) {
      AutoExtractor.extractArchive(
        item.finalPath,
        settings.automation.archivePasswords || [],
        settings.automation.deleteArchiveAfterExtract
      )
        .then((result) => broadcast('archive_extracted', { downloadId: item.id, ...result }))
        .catch(() => {});
    }

    // Remote bot completion notification
    if (settings.remote?.notifyOnComplete) {
      void ControlBot.sendNotification(`Download complete: ${item.filename}`);
    }
  });

  engine.on('item_error', (err: any, item: any) => {
    const settings = db.getSettings();
    if (settings.automation?.webhooksEnabled && settings.automation.triggerOnError && item) {
      WebhookTrigger.executeTriggers(item, {
        enabled: true,
        webhookUrl: settings.automation.webhookUrl || undefined,
        customScriptPath: undefined,
        triggerOnComplete: false,
        triggerOnError: true,
      });
    }
  });
  engine.on('item_error', (err, item) => broadcast('item_error', { error: err.message, item }));
  engine.on('item_deleted', (id) => broadcast('item_deleted', { id }));
  engine.on('log', (log) => broadcast('log', log));

  grabber.on('project_updated', (proj) => broadcast('grabber_project_updated', proj));

  // Periodic metrics broadcast
  setInterval(() => {
    if (clients.size === 0) return;
    const metrics = collectSystemMetrics(db, engine, networkQualitySvc);
    broadcast('metrics_tick', metrics);
  }, 1000);

  // Validate a user-supplied URL before the backend fetches it (SSRF guard).
  // Local / private addresses are allowed for actual downloads (NAS, dev
  // servers), but NOT for server-side content proxies.
  const assertPublicUrl = async (url: string) => {
    if (process.env.G1DM_E2E === '1') {
      try {
        const parsed = new URL(url);
        if (['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
          return;
        }
      } catch {}
    }
    await UrlGuard.assertSafePublicUrl(url);
  };

  // --- REST Routes ---

  // Downloads
  app.get('/api/downloads', (req, res) => {
    res.json(engine.getAllDownloads());
  });

  app.post('/api/downloads', async (req, res) => {
    try {
      const item = await engine.addDownload(req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/probe', async (req, res) => {
    try {
      const { url, auth, proxy } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const probe = await ProbeService.probe(url, auth, proxy);

      // Optional cloud threat-intelligence enrichment (URLhaus + VirusTotal)
      const settings = db.getSettings();
      if (settings.security?.threatIntelEnabled) {
        try {
          const intel = await ThreatIntelService.checkUrl(url, {
            virusTotalApiKey: settings.security.virusTotalApiKey || undefined,
            urlHausEnabled: settings.security.urlHausEnabled,
          });
          (probe as any).threatIntel = intel;

          // Escalate the local scanner verdict when cloud reputation flags the URL
          if (probe.safetyWarning && intel.riskScoreDelta > 0) {
            const w = probe.safetyWarning;
            w.riskScore = Math.min(100, w.riskScore + intel.riskScoreDelta);
            w.isSafe = w.riskScore < 45;
            for (const src of intel.sources) {
              if (src.verdict === 'malicious' || src.verdict === 'suspicious') {
                w.reasons.push(`Cloud reputation (${src.provider}): ${src.detail}`);
              }
            }
            if (w.riskScore >= 70) {
              w.riskLevel = 'CRITICAL_MALICIOUS';
              w.warningTitle = '⛔ CRITICAL: URL flagged by cloud threat intelligence!';
              w.warningDetails = 'One or more live threat-intelligence feeds identify this URL as an active malware or phishing endpoint.';
              w.recommendation = 'DO NOT DOWNLOAD. This URL is listed in live malware databases.';
              w.requireUserOverride = true;
            } else if (w.riskScore >= 45 && w.riskLevel === 'SAFE') {
              w.riskLevel = 'HIGH_RISK';
              w.requireUserOverride = true;
            }
          }
        } catch {
          // Threat intel is best-effort; never block the probe on API failures
        }
      }

      res.json(probe);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/downloads/:id', (req, res) => {
    const item = engine.getDownload(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  app.post('/api/downloads/:id/start', async (req, res) => {
    try {
      await engine.startDownload(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/downloads/:id/pause', (req, res) => {
    engine.pauseDownload(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/downloads/:id/resume', (req, res) => {
    engine.resumeDownload(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/downloads/:id/cancel', (req, res) => {
    engine.cancelDownload(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/downloads/:id/retry', (req, res) => {
    engine.retryDownload(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/downloads/:id/restart', (req, res) => {
    engine.restartDownload(req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/downloads/:id', (req, res) => {
    const deleteFile = req.query.deleteFile === 'true';
    engine.deleteDownload(req.params.id, deleteFile);
    res.json({ success: true });
  });

  app.post('/api/downloads/:id/open-file', async (req, res) => {
    try {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Download not found' });
      const { execFile } = await import('child_process');
      const platform = process.platform;
      const targetPath = item.finalPath;
      if (platform === 'darwin') {
        execFile('open', [targetPath]);
      } else if (platform === 'win32') {
        execFile('cmd.exe', ['/c', 'start', '""', targetPath]);
      } else {
        execFile('xdg-open', [targetPath]);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/downloads/:id/open-folder', async (req, res) => {
    try {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Download not found' });
      const { execFile } = await import('child_process');
      const platform = process.platform;
      if (platform === 'darwin') {
        execFile('open', ['-R', item.finalPath]);
      } else if (platform === 'win32') {
        execFile('explorer.exe', [`/select,${item.finalPath}`]);
      } else {
        execFile('xdg-open', [item.destinationDir]);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/downloads/:id/verify', async (req, res) => {
    try {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Download not found' });
      const { ChecksumVerifier } = await import('./engine/ChecksumVerifier');
      const verified = await ChecksumVerifier.verifyChecksum(item.finalPath, req.body.checksum || item.checksum);
      item.checksum = verified;
      db.saveDownload(item);
      broadcast('item_updated', item);
      res.json(verified);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/downloads/:id/scan', async (req, res) => {
    try {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Download not found' });
      const settings = db.getSettings();
      const scanResult = await SecurityScanner.scanFile(item.finalPath, settings.security.antivirusCommand);
      item.securityScan = scanResult;
      db.saveDownload(item);
      broadcast('item_updated', item);
      res.json(scanResult);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/downloads/:id/archive', async (req, res) => {
    try {
      const item = engine.getDownload(req.params.id);
      if (!item) return res.status(404).json({ error: 'Download not found' });
      const targetPath = fs.existsSync(item.finalPath) ? item.finalPath : item.tempPath;
      const info = await ArchiveInspector.inspect(targetPath);
      item.archiveInfo = info;
      db.saveDownload(item);
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/downloads/pause-all', (req, res) => {
    engine.pauseAll();
    res.json({ success: true });
  });

  app.post('/api/downloads/resume-all', (req, res) => {
    engine.resumeAll();
    res.json({ success: true });
  });

  app.post('/api/downloads/stop-all', (req, res) => {
    engine.stopAll();
    res.json({ success: true });
  });

  // Queues
  app.get('/api/queues', (req, res) => {
    res.json(db.getQueues());
  });

  app.post('/api/queues', (req, res) => {
    const queue = req.body;
    if (!queue.id) queue.id = `q_${Date.now()}`;
    if (!queue.createdAt) queue.createdAt = Date.now();
    db.saveQueue(queue);
    res.json(queue);
  });

  app.delete('/api/queues/:id', (req, res) => {
    db.deleteQueue(req.params.id);
    res.json({ success: true });
  });

  // Categories
  app.get('/api/categories', (req, res) => {
    res.json(db.getCategories());
  });

  app.post('/api/categories', (req, res) => {
    const cat = req.body;
    if (!cat.id) cat.id = `cat_${Date.now()}`;
    db.saveCategory(cat);
    res.json(cat);
  });

  app.delete('/api/categories/:id', (req, res) => {
    db.deleteCategory(req.params.id);
    res.json({ success: true });
  });

  // Settings
  app.get('/api/settings', (req, res) => {
    res.json(db.getSettings());
  });

  app.post('/api/settings', (req, res) => {
    db.saveSettings(req.body);
    if (req.body.downloads?.globalSpeedLimitBytesPerSec !== undefined) {
      engine.setGlobalSpeedLimit(req.body.downloads.globalSpeedLimitBytesPerSec);
    }
    // Re-apply remote-bot configuration (starts/stops Telegram polling as needed)
    applyRemoteAndPowerSettings();
    res.json(db.getSettings());
  });

  app.post('/api/settings/speed-limit', (req, res) => {
    const limit = Number(req.body.bytesPerSec) || 0;
    engine.setGlobalSpeedLimit(limit);
    res.json({ success: true, speedLimit: limit });
  });

  // System Metrics
  app.get('/api/metrics', (req, res) => {
    res.json(collectSystemMetrics(db, engine, networkQualitySvc));
  });

  // History
  app.get('/api/history', (req, res) => {
    res.json(db.getHistory());
  });

  app.delete('/api/history', (req, res) => {
    db.clearHistory();
    res.json({ success: true });
  });

  // Diagnostics
  app.post('/api/diagnostics/run', async (req, res) => {
    try {
      const results = await DiagnosticsService.runAllDiagnostics(db, engine);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/diagnostics/export', async (req, res) => {
    try {
      const results = await DiagnosticsService.runAllDiagnostics(db, engine);
      const report = DiagnosticsService.generateRedactedReport(db, engine, results);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="g1dm_diag_${Date.now()}.json"`);
      res.send(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Supercharged Features REST Routes
  app.post('/api/media/playlist/parse', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      await assertPublicUrl(url);
      const parsed = await PlaylistBatchGrabber.parsePlaylist(url);
      res.json(parsed);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/media/playlist/enqueue', async (req, res) => {
    try {
      const { playlist, destinationDir } = req.body;
      const ids = await PlaylistBatchGrabber.enqueuePlaylist(playlist, engine, destinationDir);
      res.json({ success: true, enqueuedIds: ids });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/media/dvr/schedule', (req, res) => {
    const rec = LiveStreamDVR.scheduleRecording(req.body);
    res.json(rec);
  });

  app.get('/api/media/dvr/recordings', (req, res) => {
    res.json(LiveStreamDVR.getAllRecordings());
  });

  app.post('/api/media/dvr/:id/cancel', async (req, res) => {
    const success = await LiveStreamDVR.cancelRecording(req.params.id);
    res.json({ success });
  });

  app.post('/api/media/tracks/extract', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      await assertPublicUrl(url);
      const tracks = await MultiTrackExtractor.extractTracks(url);
      res.json(tracks);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/media/transcode', async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.sourceFilePath) {
        body.sourceFilePath = PathGuard.assertSafeLocalPath(body.sourceFilePath);
      }
      const result = await MediaTranscoder.transcode(body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/media/metadata/inject', async (req, res) => {
    try {
      const { filePath, metadata } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const ok = await MetadataInjector.injectMetadata(safePath, metadata);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/network/adapters', (req, res) => {
    res.json(ChannelBonding.detectAdapters());
  });

  app.post('/api/network/dual-stack/select', async (req, res) => {
    try {
      const { hostname } = req.body;
      const result = await DualStackSelector.selectOptimalFamily(hostname);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/network/latency-sense/update', (req, res) => {
    const { pingMs } = req.body;
    const throttled = LatencySense.updatePing(pingMs, engine);
    res.json({ ...LatencySense.getStatus(), throttled });
  });

  app.get('/api/network/latency-sense/status', (req, res) => {
    res.json(LatencySense.getStatus());
  });

  app.post('/api/torrent/add', (req, res) => {
    try {
      const { magnetOrFilePath } = req.body;
      const status = TorrentEngine.addTorrent(magnetOrFilePath);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/torrent/list', (req, res) => {
    res.json(TorrentEngine.getAllTorrents());
  });

  app.post('/api/archive/auto-extract', async (req, res) => {
    try {
      const { filePath, passwords, deleteOriginalArchive } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const result = await AutoExtractor.extractArchive(safePath, passwords, deleteOriginalArchive);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/debrid/account', (req, res) => {
    DebridManager.addAccount(req.body);
    res.json({ success: true });
  });

  app.post('/api/debrid/unrestrict', async (req, res) => {
    try {
      const { url, provider } = req.body;
      const unrestrict = await DebridManager.unrestrictLink(url, provider);
      res.json(unrestrict);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/storage/cloud/upload', async (req, res) => {
    try {
      const { filePath, target } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const result = await CloudSyncManager.uploadToCloud(safePath, target);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/storage/dropbox/process', async (req, res) => {
    try {
      const { filePath } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const count = await DropBoxWatcher.processDropFile(safePath, engine);
      res.json({ count });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/security/vault/unlock', (req, res) => {
    const { password } = req.body;
    const ok = EncryptedVault.unlockVault(password);
    res.json({ unlocked: ok });
  });

  app.post('/api/security/vault/lock', (req, res) => {
    EncryptedVault.lockVault();
    res.json({ locked: true });
  });

  app.post('/api/security/vault/store', async (req, res) => {
    try {
      const { filePath } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const item = await EncryptedVault.encryptAndStoreFile(safePath);
      res.json(item);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/security/vault/export', async (req, res) => {
    try {
      const { vaultItemId, outputDir } = req.body;
      const exportedPath = await EncryptedVault.decryptAndExportFile(vaultItemId, outputDir);
      res.json({ exportedPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/security/vault/items', (req, res) => {
    res.json(EncryptedVault.getVaultItems());
  });

  app.post('/api/remote/bot/command', async (req, res) => {
    try {
      const { commandText } = req.body;
      const result = await ControlBot.processCommand(commandText, engine);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/remote/bot/status', (req, res) => {
    res.json(ControlBot.getStatus());
  });

  app.post('/api/remote/bot/test', async (req, res) => {
    const sent = await ControlBot.sendNotification(req.body?.message || 'Test notification from G1DM 🎉');
    res.json({ sent });
  });

  // Cloud threat intelligence (URLhaus free + optional VirusTotal key)
  app.post('/api/security/threat-intel/check', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const settings = db.getSettings();
      const intel = await ThreatIntelService.checkUrl(url, {
        virusTotalApiKey: settings.security.virusTotalApiKey || undefined,
        urlHausEnabled: settings.security.urlHausEnabled,
      });
      res.json(intel);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // OS Power Governor
  app.get('/api/power/governor', (req, res) => {
    res.json(PowerGovernor.getStatus());
  });

  app.post('/api/power/governor/cancel', (req, res) => {
    PowerGovernor.cancelPending();
    res.json({ cancelled: true });
  });

  // Mount Versioned API v1 Router
  const { createApiV1Router } = require('./api/ApiV1');
  app.use('/api/v1', createApiV1Router(engine, db));

  // Automation Rules Engine
  const { RuleEngine } = require('./automation/RuleEngine');
  const ruleEngine = new RuleEngine();

  app.get('/api/rules', (req, res) => {
    res.json(ruleEngine.getRules());
  });

  app.post('/api/rules', (req, res) => {
    ruleEngine.setRules(req.body);
    res.json(ruleEngine.getRules());
  });

  app.get('/api/rules/logs', (req, res) => {
    res.json(ruleEngine.getExecutionLogs());
  });

  // Storage Pools
  const { StoragePoolManager } = require('./storage/StoragePoolManager');
  const appSettings = db.getSettings();
  const storagePoolMgr = new StoragePoolManager([appSettings.general.defaultDownloadDir]);

  app.get('/api/storage/pools', (req, res) => {
    res.json(storagePoolMgr.getAllPools());
  });

  // Templates & Favorites
  const { TemplateManager } = require('./engine/TemplateManager');
  const templateMgr = new TemplateManager();

  app.get('/api/templates', (req, res) => {
    res.json(templateMgr.getTemplates());
  });

  app.get('/api/favorites', (req, res) => {
    res.json(templateMgr.getFavorites());
  });

  // Snapshots
  const { SnapshotManager } = require('./engine/SnapshotManager');

  app.get('/api/snapshots/:id', (req, res) => {
    const item = engine.getDownload(req.params.id);
    if (!item) return res.status(404).json({ error: 'Download not found' });
    const snap = SnapshotManager.createSnapshot(item);
    res.json(snap);
  });

  // Error Incidents
  const { ErrorIncidentEngine } = require('./diagnostics/ErrorIncidentEngine');
  const incidentEngine = new ErrorIncidentEngine();

  app.get('/api/incidents', (req, res) => {
    res.json(incidentEngine.getIncidents());
  });

  // Support Bundle
  const { SupportBundle } = require('./diagnostics/SupportBundle');

  app.get('/api/support-bundle', async (req, res) => {
    try {
      const { DiagnosticsService } = require('./diagnostics/DiagnosticsService');
      const diagResults = await DiagnosticsService.runAllDiagnostics(db, engine);
      const bundle = SupportBundle.generateBundle(db, engine, diagResults);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="g1dm_support_bundle_${Date.now()}.json"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Media Library
  const { MediaLibrary } = require('./media/MediaLibrary');
  const mediaLibrary = new MediaLibrary();

  app.get('/api/media/library', (req, res) => {
    res.json(mediaLibrary.getLibrary());
  });

  // Archive Intelligence 2.0
  const { ArchiveIntelligence } = require('./archive/ArchiveIntelligence');

  app.post('/api/archive/analyze', async (req, res) => {
    try {
      const { filePath } = req.body;
      const safePath = PathGuard.assertSafeLocalPath(filePath);
      const report = await ArchiveIntelligence.analyzeArchive(safePath);
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Download Benchmark Mode
  const { DownloadBenchmark } = require('./engine/DownloadBenchmark');

  app.post('/api/benchmark', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      await assertPublicUrl(url);
      const report = await DownloadBenchmark.runBenchmark(url, 1000);
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Autopilot & Health 2.0
  app.get('/api/autopilot/:id', (req, res) => {
    const item = engine.getDownload(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const { DownloadAutopilot } = require('./intelligence/DownloadAutopilot');
    const storageStats = StorageManager.getStorageStats(item.destinationDir);
    const decision = DownloadAutopilot.evaluateDownload(item, storageStats.freeBytes);
    res.json(decision);
  });

  app.get('/api/health2/:id', (req, res) => {
    const item = engine.getDownload(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const { HealthScore2 } = require('./intelligence/HealthScore2');
    const storageStats = StorageManager.getStorageStats(item.destinationDir);
    const health = HealthScore2.calculate(item, storageStats.freeBytes);
    res.json(health);
  });

  // Network Quality Center & Bandwidth Budget
  const { NetworkQualityService } = require('./network/NetworkQualityService');
  const networkQualitySvc = new NetworkQualityService();

  app.get('/api/network/quality', async (req, res) => {
    try {
      const report = await networkQualitySvc.measureQuality();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/network/budget', (req, res) => {
    networkQualitySvc.setBudgetConfig(req.body);
    res.json(networkQualitySvc.getBudgetConfig());
  });

  // Undo System
  const { UndoManager } = require('./engine/UndoManager');
  const undoManager = new UndoManager(db);

  app.get('/api/undo/stack', (req, res) => {
    res.json(undoManager.getUndoStack());
  });

  app.post('/api/undo', async (req, res) => {
    try {
      const result = await undoManager.undoLastAction();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Security Audit
  app.post('/api/security/audit', async (req, res) => {
    try {
      const { SecurityAudit } = require('./security/SecurityAudit');
      const report = await SecurityAudit.runAudit(db);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Smart Onboarding Self-Check
  app.get('/api/onboarding/self-check', async (req, res) => {
    try {
      const { OnboardingService } = require('./engine/OnboardingService');
      const report = await OnboardingService.runSelfCheck(db);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Secure Media Detection & Video Resolution Intelligence
  app.post('/api/media/secure-detect', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      await assertPublicUrl(url);
      const { SecureMediaDetector } = await import('./media/SecureMediaDetector');
      const analysis = await SecureMediaDetector.analyze(url);
      res.json(analysis);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Browser Integration Self-Healing
  app.get('/api/browser/health', async (req, res) => {
    try {
      const { BrowserIntegrationManager } = await import('./browser/BrowserIntegrationManager');
      const health = await BrowserIntegrationManager.getHealthStatus();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/browser/repair', async (req, res) => {
    try {
      const { browser } = req.body;
      const { BrowserIntegrationManager } = await import('./browser/BrowserIntegrationManager');
      const result = await BrowserIntegrationManager.repairBrowser(browser || 'chrome');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // TLS & Certificate Inspector
  app.post('/api/tls/inspect', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      const { TlsInspector } = await import('./engine/TlsInspector');
      const inspection = await TlsInspector.inspectTls(url);
      res.json(inspection);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Media Detection (Backward compatible)
  app.post('/api/media/detect', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      await assertPublicUrl(url);
      const result = await MediaDetector.detectMedia(url);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Live Stream Preview & HTTP 206 Partial Content
  app.get('/api/downloads/:id/stream', async (req, res) => {
    try {
      const { StreamPreviewService } = await import('./engine/StreamPreviewService');
      await StreamPreviewService.handleStreamRequest(req, res, req.params.id);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/downloads/:id/preview-status', async (req, res) => {
    try {
      const { StreamPreviewService } = await import('./engine/StreamPreviewService');
      const status = StreamPreviewService.getPreviewStatus(req.params.id);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cloud Host Direct Link Resolver
  app.post('/api/cloud/resolve', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required' });
      await assertPublicUrl(url);
      const { CloudLinkResolver } = await import('./media/CloudLinkResolver');
      const resolved = CloudLinkResolver.resolve(url);
      res.json(resolved);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Multi-Mirror Swarm Prober
  app.post('/api/mirrors/swarm/probe', async (req, res) => {
    try {
      const { primaryUrl, mirrors } = req.body;
      if (!primaryUrl) return res.status(400).json({ error: 'primaryUrl required' });
      await assertPublicUrl(primaryUrl);
      for (const m of (mirrors || []).slice(0, 32)) {
        await assertPublicUrl(m);
      }
      const { MultiMirrorSwarmEngine } = await import('./engine/MultiMirrorSwarmEngine');
      const swarm = new MultiMirrorSwarmEngine(primaryUrl, mirrors || []);
      const probed = await swarm.probeAllMirrors();
      res.json({ mirrors: probed });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Batch Links Extractor
  app.post('/api/batch/extract', async (req, res) => {
    try {
      const { input } = req.body;
      if (!input) return res.status(400).json({ error: 'Input required' });
      const trimmed = String(input).trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        await assertPublicUrl(trimmed);
      }
      const candidates = await LinkBatchExtractor.extractFromUrlOrText(input);
      res.json(candidates);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Site Grabber
  app.get('/api/grabber/projects', (req, res) => {
    res.json(db.getGrabberProjects());
  });

  app.post('/api/grabber/projects', (req, res) => {
    const proj = req.body;
    if (!proj.id) proj.id = `proj_${Date.now()}`;
    if (!proj.createdAt) proj.createdAt = Date.now();
    if (!proj.discoveredUrls) proj.discoveredUrls = [];
    if (!proj.totalDiscovered) proj.totalDiscovered = 0;
    if (!proj.totalDownloaded) proj.totalDownloaded = 0;
    if (!proj.status) proj.status = 'idle';
    db.saveGrabberProject(proj);
    res.json(proj);
  });

  app.post('/api/grabber/projects/:id/start', async (req, res) => {
    try {
      await grabber.startProject(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/grabber/projects/:id/stop', (req, res) => {
    grabber.stopProject(req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/grabber/projects/:id', (req, res) => {
    db.deleteGrabberProject(req.params.id);
    res.json({ success: true });
  });

  // Storage Maintenance
  app.get('/api/storage/maintenance', async (req, res) => {
    try {
      const scan = await StorageManager.scanMaintenance(db);
      res.json(scan);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/storage/maintenance/clean', (req, res) => {
    const { filePaths } = req.body;
    if (!Array.isArray(filePaths)) return res.status(400).json({ error: 'filePaths array required' });
    const result = StorageManager.cleanOrphanedFiles(filePaths);
    res.json(result);
  });

  // Clipboard Check
  app.post('/api/clipboard/check', (req, res) => {
    const { text } = req.body;
    const result = clipboardMonitor.checkClipboardText(text);
    res.json(result);
  });

  if (process.env.G1DM_E2E === '1') {
    app.post('/api/test/reset', async (req, res) => {
      try {
        engine.pauseAll();

        for (const item of [...engine.getAllDownloads()]) {
          engine.deleteDownload(item.id, true);
        }

        const settings = db.getSettings();
        settings.downloads.maxRetries = typeof req.body?.maxRetries === 'number' ? req.body.maxRetries : 5;
        settings.downloads.globalSpeedLimitBytesPerSec = 0;
        db.saveSettings(settings);

        const roots = new Set<string>([settings.general.defaultDownloadDir]);
        for (const category of db.getCategories()) {
          if (category.defaultDestination) roots.add(category.defaultDestination);
        }
        for (const queue of db.getQueues()) {
          if (queue.destinationDir) roots.add(queue.destinationDir);
        }

        for (const root of roots) {
          if (!root) continue;
          try {
            fs.rmSync(root, { recursive: true, force: true });
          } catch {}
          fs.mkdirSync(root, { recursive: true });
        }

        db.clearHistory();
        db.flush();

        res.json({
          success: true,
          downloads: engine.getAllDownloads().length,
          downloadDir: settings.general.defaultDownloadDir,
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/test/state', (req, res) => {
      res.json({
        downloads: engine.getAllDownloads(),
        settings: db.getSettings(),
        history: db.getHistory(),
        wsClients: clients.size,
      });
    });

    app.post('/api/test/ws/disconnect', (req, res) => {
      for (const ws of [...clients]) {
        try {
          ws.close(4000, 'E2E forced disconnect');
        } catch {}
      }
      res.json({ success: true });
    });
  }

  // Export / Import State
  app.get('/api/export', (req, res) => {
    const exportData = {
      version: '1.0.0',
      timestamp: Date.now(),
      downloads: db.getAllDownloads(),
      queues: db.getQueues(),
      categories: db.getCategories(),
      settings: redactSettings(db.getSettings()),
      history: db.getHistory(),
      grabberProjects: db.getGrabberProjects(),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="g1dm_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  });

  app.post('/api/import', (req, res) => {
    try {
      const data = req.body;
      if (data.settings) db.saveSettings(data.settings);
      if (Array.isArray(data.categories)) {
        data.categories.forEach((c: any) => db.saveCategory(c));
      }
      if (Array.isArray(data.queues)) {
        data.queues.forEach((q: any) => db.saveQueue(q));
      }
      if (Array.isArray(data.downloads)) {
        data.downloads.forEach((d: any) => db.saveDownload(d));
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Forward all other requests to Next.js handler
  app.all('*', (req, res) => {
    return nextHandler(req, res);
  });

  return new Promise<{ server: any; app: any; db: AppDatabase; engine: DownloadEngine }>((resolve, reject) => {
    // Bind to all interfaces so the mobile PWA / remote clients on the local
    // network (or Tailscale) can reach the dashboard. Override with G1DM_HOST.
    const host = process.env.G1DM_HOST || '0.0.0.0';
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      console.log(`[G1DM] Application running at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port} (bound to ${host})`);
      resolve({ server, app, db, engine });
    });
  });
}

function collectSystemMetrics(db: AppDatabase, engine: DownloadEngine, networkQualitySvc?: any): SystemMetrics {
  const settings = db.getSettings();
  const downloads = engine.getAllDownloads();

  const activeDownloads = downloads.filter((d) => d.status === 'downloading');
  const activeSpeed = activeDownloads.reduce((sum, d) => sum + d.speed, 0);
  const totalDownloaded = downloads.reduce((sum, d) => sum + d.downloadedBytes, 0);
  const totalConnections = activeDownloads.reduce((sum, d) => sum + d.activeConnections, 0);

  const storageStats = StorageManager.getStorageStats(settings.general.defaultDownloadDir);

  const interfaces: { name: string; address: string; family: string; internal: boolean }[] = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        interfaces.push({
          name,
          address: a.address,
          family: a.family,
          internal: a.internal,
        });
      }
    }
  }

  const realRtt = networkQualitySvc ? networkQualitySvc.getLatestRtt() : 0;

  return {
    network: {
      online: true,
      interfaces,
      activeDownloadSpeed: activeSpeed,
      activeUploadSpeed: 0,
      totalBytesDownloaded: totalDownloaded,
      pingLatencyMs: realRtt,
    },
    storage: {
      totalBytes: storageStats.totalBytes,
      freeBytes: storageStats.freeBytes,
      usedBytes: storageStats.usedBytes,
      downloadDir: settings.general.defaultDownloadDir,
      downloadDirFreeBytes: storageStats.freeBytes,
      tempDirFreeBytes: storageStats.freeBytes,
    },
    engine: {
      activeWorkers: activeDownloads.length,
      totalConnections,
      queuedJobs: downloads.filter((d) => d.status === 'queued').length,
      memoryUsageBytes: process.memoryUsage().heapUsed,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    diagnostics: [],
  };
}

if (require.main === module) {
  createUnifiedServer(parseInt(process.env.PORT || '8055', 10))
    .then(({ server, db }) => {
      let _exiting = false;

      const shutdown = (signal: string) => {
        if (_exiting) return;
        _exiting = true;
        console.log(`\n[G1DM] Received ${signal} — shutting down gracefully...`);

        // Stop accepting new HTTP/WS connections.
        server.close(() => {
          // Flush the SQLite database before the process exits.
          try { db.flush(); } catch { /* best-effort */ }
          console.log('[G1DM] Clean shutdown complete.');
          process.exit(0);
        });

        // Force-exit after 6 s if the server hangs (active connections, etc.).
        setTimeout(() => {
          console.error('[G1DM] Forced exit after timeout.');
          process.exit(1);
        }, 6000).unref();
      };

      process.on('SIGINT',  () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('[G1DM] Failed to start:', err);
      process.exit(1);
    });
}
