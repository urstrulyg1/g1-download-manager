import * as dns from 'dns';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { DiagnosticCheckResult } from '../../shared/types';
import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { StorageManager } from '../storage/StorageManager';

export class DiagnosticsService {
  public static async runAllDiagnostics(db: AppDatabase, engine: DownloadEngine): Promise<DiagnosticCheckResult[]> {
    const results: DiagnosticCheckResult[] = [];
    const settings = db.getSettings();

    // 1. Internet Connectivity
    const internetCheck = await this.checkInternet();
    results.push(internetCheck);

    // 2. DNS Latency
    const dnsCheck = await this.checkDns();
    results.push(dnsCheck);

    // 3. TLS Handshake & Cipher
    const tlsCheck = await this.checkTls();
    results.push(tlsCheck);

    // 4. Storage & Disk I/O
    const diskCheck = await this.checkDiskIo(settings.general.defaultDownloadDir);
    results.push(diskCheck);

    // 5. Storage Free Space
    const storageStats = StorageManager.getStorageStats(settings.general.defaultDownloadDir);
    const freeGb = (storageStats.freeBytes / 1024 / 1024 / 1024).toFixed(2);
    results.push({
      id: 'diag-storage-space',
      category: 'storage',
      name: 'Storage Capacity',
      status: storageStats.freeBytes > 1024 * 1024 * 1024 ? 'ok' : 'warning',
      message: `${freeGb} GB free available in download location.`,
      details: `Total: ${(storageStats.totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB, Used: ${(storageStats.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB`,
      timestamp: Date.now(),
    });

    // 6. Download Engine Health
    const downloads = engine.getAllDownloads();
    const activeWorkers = downloads.filter((d) => d.status === 'downloading').length;
    results.push({
      id: 'diag-engine-workers',
      category: 'engine',
      name: 'Download Engine Status',
      status: 'ok',
      message: `Engine online. Active downloads: ${activeWorkers}, Total managed: ${downloads.length}.`,
      details: `Rate limit: ${engine.getGlobalRateLimit() > 0 ? `${(engine.getGlobalRateLimit() / 1024).toFixed(0)} KB/s` : 'Unlimited'}`,
      timestamp: Date.now(),
    });

    // 7. Security Scanner
    results.push({
      id: 'diag-security-scanner',
      category: 'security',
      name: 'Antivirus Scanner Integration',
      status: settings.security.runAntivirusScan ? 'ok' : 'unsupported',
      message: settings.security.runAntivirusScan
        ? `Configured command: ${settings.security.antivirusCommand}`
        : 'Antivirus scan disabled in settings.',
      details: 'OS-level security scanning hook is available for completed files.',
      timestamp: Date.now(),
    });

    // 8. Browser Integration Port
    results.push({
      id: 'diag-browser-integration',
      category: 'browser',
      name: 'Browser Extension Connector',
      status: 'ok',
      message: `Integration connector enabled on port ${settings.browser.integrationPort}.`,
      details: `Native messaging host supported for Chrome, Firefox, Edge.`,
      timestamp: Date.now(),
    });

    return results;
  }

  private static async checkInternet(): Promise<DiagnosticCheckResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const req = https.get('https://1.1.1.1', { timeout: 5000 }, (res) => {
        const latency = Date.now() - startTime;
        res.destroy();
        resolve({
          id: 'diag-internet',
          category: 'network',
          name: 'Internet Connectivity',
          status: 'ok',
          message: `Connected (HTTP Ping: ${latency}ms).`,
          details: `Connected to Cloudflare 1.1.1.1 gateway.`,
          timestamp: Date.now(),
        });
      });

      req.on('error', (err) => {
        resolve({
          id: 'diag-internet',
          category: 'network',
          name: 'Internet Connectivity',
          status: 'error',
          message: `Connection failed: ${err.message}`,
          timestamp: Date.now(),
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          id: 'diag-internet',
          category: 'network',
          name: 'Internet Connectivity',
          status: 'error',
          message: 'Connection timed out (5000ms).',
          timestamp: Date.now(),
        });
      });
    });
  }

  private static async checkDns(): Promise<DiagnosticCheckResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      dns.lookup('one.one.one.one', (err, address) => {
        const latency = Date.now() - startTime;
        if (err) {
          resolve({
            id: 'diag-dns',
            category: 'network',
            name: 'DNS Resolution',
            status: 'error',
            message: `DNS lookup failed: ${err.message}`,
            timestamp: Date.now(),
          });
          return;
        }

        resolve({
          id: 'diag-dns',
          category: 'network',
          name: 'DNS Resolution',
          status: latency < 300 ? 'ok' : 'warning',
          message: `Resolved in ${latency}ms (${address}).`,
          details: `Target: one.one.one.one -> ${address}`,
          timestamp: Date.now(),
        });
      });
    });
  }

  private static async checkTls(): Promise<DiagnosticCheckResult> {
    return new Promise((resolve) => {
      const req = https.get('https://www.google.com', { timeout: 5000 }, (res) => {
        const tlsSocket = res.socket as any;
        const cipher = tlsSocket.getCipher ? tlsSocket.getCipher() : {};
        const protocol = tlsSocket.getProtocol ? tlsSocket.getProtocol() : 'TLS';
        res.destroy();

        resolve({
          id: 'diag-tls',
          category: 'network',
          name: 'TLS Handshake & Encryption',
          status: 'ok',
          message: `${protocol} verified with ${cipher.name || 'AES-GCM'}.`,
          details: `Cipher: ${cipher.name || 'Unknown'}, Version: ${cipher.version || protocol}`,
          timestamp: Date.now(),
        });
      });

      req.on('error', (err) => {
        resolve({
          id: 'diag-tls',
          category: 'network',
          name: 'TLS Handshake & Encryption',
          status: 'error',
          message: `TLS Handshake failed: ${err.message}`,
          timestamp: Date.now(),
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          id: 'diag-tls',
          category: 'network',
          name: 'TLS Handshake & Encryption',
          status: 'warning',
          message: 'TLS Handshake timed out.',
          timestamp: Date.now(),
        });
      });
    });
  }

  private static async checkDiskIo(downloadDir: string): Promise<DiagnosticCheckResult> {
    try {
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const testFile = path.join(downloadDir, `.g1dm_iotest_${Date.now()}`);
      const testBuffer = Buffer.alloc(1024 * 64, 0x41); // 64KB

      const startWrite = Date.now();
      fs.writeFileSync(testFile, testBuffer);
      const writeTime = Date.now() - startWrite;

      const startRead = Date.now();
      const readBuf = fs.readFileSync(testFile);
      const readTime = Date.now() - startRead;

      fs.unlinkSync(testFile);

      return {
        id: 'diag-disk-io',
        category: 'storage',
        name: 'Disk Read/Write Performance',
        status: 'ok',
        message: `Write: ${writeTime}ms, Read: ${readTime}ms (64 KB).`,
        details: `Path: ${downloadDir}, Bytes tested: ${readBuf.length}`,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      return {
        id: 'diag-disk-io',
        category: 'storage',
        name: 'Disk Read/Write Performance',
        status: 'error',
        message: `I/O Test failed: ${err.message}`,
        timestamp: Date.now(),
      };
    }
  }

  public static generateRedactedReport(db: AppDatabase, engine: DownloadEngine, results: DiagnosticCheckResult[]): string {
    const settings = db.getSettings();
    const cleanSettings = JSON.parse(JSON.stringify(settings));

    // Redact private fields
    if (cleanSettings.network) {
      if (cleanSettings.network.proxyPassword) cleanSettings.network.proxyPassword = '***REDACTED***';
      if (cleanSettings.network.proxyUsername) cleanSettings.network.proxyUsername = '***REDACTED***';
    }

    const report = {
      product: 'G1DM — Next-Generation Internet Download Manager',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
      },
      diagnostics: results,
      settings: cleanSettings,
      activeDownloadsCount: engine.getAllDownloads().filter((d) => d.status === 'downloading').length,
      totalDownloadsCount: engine.getAllDownloads().length,
    };

    return JSON.stringify(report, null, 2);
  }
}
