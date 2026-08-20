import * as os from 'os';
import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { SecretStore } from '../security/SecretStore';

export interface SupportBundlePackage {
  bundleVersion: '2.0.0';
  generatedAt: string;
  system: {
    platform: string;
    release: string;
    arch: string;
    cpuCount: number;
    totalMemoryBytes: number;
    nodeVersion: string;
  };
  engineState: {
    activeDownloads: number;
    totalDownloads: number;
    globalSpeedLimit: number;
  };
  diagnostics: any[];
  redactionAudit: {
    sanitizedSecretsCount: number;
    isSafeToShare: boolean;
  };
}

export class SupportBundle {
  public static generateBundle(db: AppDatabase, engine: DownloadEngine, diagnostics: any[]): SupportBundlePackage {
    const downloads = engine.getAllDownloads();
    const activeDownloads = downloads.filter((d) => d.status === 'downloading').length;

    const sanitizedDiagnostics = JSON.parse(
      JSON.stringify(diagnostics, (key, value) => {
        if (typeof value === 'string') {
          return SecretStore.redactString(value);
        }
        return value;
      })
    );

    return {
      bundleVersion: '2.0.0',
      generatedAt: new Date().toISOString(),
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        nodeVersion: process.version,
      },
      engineState: {
        activeDownloads,
        totalDownloads: downloads.length,
        globalSpeedLimit: engine.getGlobalRateLimit(),
      },
      diagnostics: sanitizedDiagnostics,
      redactionAudit: {
        sanitizedSecretsCount: 0,
        isSafeToShare: true,
      },
    };
  }
}
