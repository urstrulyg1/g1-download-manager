import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NativeMessagingHost, BrowserStatus } from './NativeMessagingHost';

export interface BrowserHealthReport {
  browser: 'Chrome' | 'Edge' | 'Firefox' | 'Brave' | 'Chromium' | 'Safari';
  status: 'HEALTHY' | 'DEGRADED' | 'BROKEN';
  nativeHostInstalled: boolean;
  manifestPath: string;
  ipcPortOpen: boolean;
  issues: string[];
  autoFixAvailable: boolean;
}

export class BrowserIntegrationManager {
  private static readonly IPC_PORT = 19830;

  public static async getHealthStatus(): Promise<BrowserHealthReport[]> {
    const browsers: ('Chrome' | 'Edge' | 'Firefox' | 'Brave' | 'Chromium' | 'Safari')[] = [
      'Chrome',
      'Edge',
      'Firefox',
      'Brave',
      'Chromium',
      'Safari',
    ];

    const reports: BrowserHealthReport[] = [];

    for (const b of browsers) {
      if (b === 'Safari') {
        reports.push({
          browser: 'Safari',
          status: os.platform() === 'darwin' ? 'DEGRADED' : 'BROKEN',
          nativeHostInstalled: false,
          manifestPath: 'N/A',
          ipcPortOpen: true,
          issues: ['Safari requires separate App Extension signed build on macOS.'],
          autoFixAvailable: false,
        });
        continue;
      }

      const manifestPath = NativeMessagingHost.getManifestPath(b.toLowerCase() as any);
      const manifestExists = fs.existsSync(manifestPath);

      const issues: string[] = [];
      if (!manifestExists) {
        issues.push(`Native messaging manifest missing at: ${manifestPath}`);
      }

      const status: 'HEALTHY' | 'DEGRADED' | 'BROKEN' = manifestExists ? 'HEALTHY' : 'DEGRADED';

      reports.push({
        browser: b,
        status,
        nativeHostInstalled: manifestExists,
        manifestPath,
        ipcPortOpen: true,
        issues,
        autoFixAvailable: !manifestExists,
      });
    }

    return reports;
  }

  public static async repairBrowser(browserName: string): Promise<{ success: boolean; message: string }> {
    const b = browserName.toLowerCase();
    const manifestPath = NativeMessagingHost.getManifestPath(b as any);
    const manifestDir = path.dirname(manifestPath);

    try {
      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }

      const hostBinary = path.join(process.cwd(), 'dist', 'main', 'cli', 'index.js');
      const manifestContent = NativeMessagingHost.generateManifest(hostBinary);

      fs.writeFileSync(manifestPath, manifestContent);
      return {
        success: true,
        message: `Successfully repaired ${browserName} integration! Native host registered at ${manifestPath}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to repair ${browserName}: ${err.message}`,
      };
    }
  }
}
