import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { redactSettings } from '../security/Redact';
import { SecretStore } from '../security/SecretStore';

export interface CrashReportPackage {
  reportId: string;
  appVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
  nodeVersion: string;
  timestamp: string;
  errorCategory: string;
  message: string;
  stack?: string;
  activeOperationState: {
    activeDownloadsCount: number;
    queuedDownloadsCount: number;
    totalDownloadsCount: number;
    globalRateLimit: number;
    memoryUsage: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
    uptimeSeconds: number;
  };
  sanitizedSettings: any;
  sanitizedDiagnostics?: any;
  securityAudit: {
    secretsSanitized: boolean;
    telemetryTransmitted: boolean;
    localRetentionOnly: boolean;
  };
}

export class CrashReporter {
  private static db: AppDatabase | null = null;
  private static engine: DownloadEngine | null = null;
  private static readonly APP_VERSION = '4.0.0';

  public static initialize(db: AppDatabase, engine: DownloadEngine): void {
    CrashReporter.db = db;
    CrashReporter.engine = engine;

    // Attach global process unhandled handlers
    process.on('uncaughtException', (err: Error) => {
      CrashReporter.recordCrash('UNCAUGHT_EXCEPTION', err.message, err.stack);
    });

    process.on('unhandledRejection', (reason: any) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      CrashReporter.recordCrash('UNHANDLED_REJECTION', msg, stack);
    });
  }

  public static recordCrash(
    category: string,
    message: string,
    stack?: string,
    extraContext?: any
  ): CrashReportPackage {
    const reportId = `CRASH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedMsg = SecretStore.redactString(message);
    const sanitizedStack = stack ? SecretStore.redactString(stack) : undefined;

    const mem = process.memoryUsage();
    const activeDownloads = CrashReporter.engine
      ? CrashReporter.engine.getAllDownloads().filter((d) => d.status === 'downloading').length
      : 0;
    const queuedDownloads = CrashReporter.engine
      ? CrashReporter.engine.getAllDownloads().filter((d) => d.status === 'queued').length
      : 0;
    const totalDownloads = CrashReporter.engine ? CrashReporter.engine.getAllDownloads().length : 0;
    const globalLimit = CrashReporter.engine ? CrashReporter.engine.getGlobalRateLimit() : 0;

    const rawSettings = CrashReporter.db ? CrashReporter.db.getSettings() : ({} as any);
    const cleanSettings = redactSettings(rawSettings);

    const report: CrashReportPackage = {
      reportId,
      appVersion: CrashReporter.APP_VERSION,
      platform: os.platform(),
      arch: os.arch(),
      osRelease: os.release(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      errorCategory: category,
      message: sanitizedMsg,
      stack: sanitizedStack,
      activeOperationState: {
        activeDownloadsCount: activeDownloads,
        queuedDownloadsCount: queuedDownloads,
        totalDownloadsCount: totalDownloads,
        globalRateLimit: globalLimit,
        memoryUsage: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
        uptimeSeconds: Math.floor(process.uptime()),
      },
      sanitizedSettings: cleanSettings,
      sanitizedDiagnostics: extraContext ? JSON.parse(SecretStore.redactString(JSON.stringify(extraContext))) : undefined,
      securityAudit: {
        secretsSanitized: true,
        telemetryTransmitted: false,
        localRetentionOnly: true,
      },
    };

    // Persist to SQLite crash_logs table
    if (CrashReporter.db) {
      try {
        CrashReporter.db.saveCrashLog({
          id: reportId,
          timestamp: Date.now(),
          appVersion: CrashReporter.APP_VERSION,
          platform: `${os.platform()} (${os.arch()})`,
          errorCategory: category,
          message: sanitizedMsg,
          stack: sanitizedStack,
          activeOperationsState: report.activeOperationState,
          sanitizedDiagnostics: report.sanitizedDiagnostics,
        });
      } catch (err) {
        console.warn('Could not persist crash log to SQLite:', err);
      }
    }

    // Persist locally to ~/.g1dm/crash_logs/
    try {
      const homeDir = process.env.G1DM_HOME || process.env.HOME || '/home/user';
      const logDir = path.join(homeDir, '.g1dm', 'crash_logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `${reportId}.json`);
      fs.writeFileSync(logFile, JSON.stringify(report, null, 2));

      // Keep only last 20 files
      const existing = fs.readdirSync(logDir).filter((f) => f.startsWith('CRASH_') && f.endsWith('.json'));
      if (existing.length > 20) {
        existing
          .sort()
          .slice(0, existing.length - 20)
          .forEach((f) => {
            try {
              fs.unlinkSync(path.join(logDir, f));
            } catch {}
          });
      }
    } catch {}

    return report;
  }

  public static generateExportableCrashReport(
    db?: AppDatabase,
    engine?: DownloadEngine
  ): CrashReportPackage {
    const activeDb = db || CrashReporter.db;
    const activeEngine = engine || CrashReporter.engine;

    const reportId = `DIAG_REPORT_${Date.now()}`;
    const mem = process.memoryUsage();
    const allDownloads = activeEngine ? activeEngine.getAllDownloads() : [];
    const activeDownloads = allDownloads.filter((d) => d.status === 'downloading').length;
    const queuedDownloads = allDownloads.filter((d) => d.status === 'queued').length;
    const totalDownloads = allDownloads.length;
    const globalLimit = activeEngine ? activeEngine.getGlobalRateLimit() : 0;

    const rawSettings = activeDb ? activeDb.getSettings() : ({} as any);
    const cleanSettings = redactSettings(rawSettings);

    const crashLogs = activeDb ? activeDb.getCrashLogs(10) : [];

    return {
      reportId,
      appVersion: CrashReporter.APP_VERSION,
      platform: os.platform(),
      arch: os.arch(),
      osRelease: os.release(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      errorCategory: 'SYSTEM_DIAGNOSTICS_SNAPSHOT',
      message: 'User-requested sanitized crash and diagnostics export bundle.',
      activeOperationState: {
        activeDownloadsCount: activeDownloads,
        queuedDownloadsCount: queuedDownloads,
        totalDownloadsCount: totalDownloads,
        globalRateLimit: globalLimit,
        memoryUsage: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
        uptimeSeconds: Math.floor(process.uptime()),
      },
      sanitizedSettings: cleanSettings,
      sanitizedDiagnostics: {
        recentCrashIncidents: crashLogs,
      },
      securityAudit: {
        secretsSanitized: true,
        telemetryTransmitted: false,
        localRetentionOnly: true,
      },
    };
  }
}
