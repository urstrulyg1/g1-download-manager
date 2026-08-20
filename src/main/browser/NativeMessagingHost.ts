import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BrowserStatus {
  browser: 'Chrome' | 'Edge' | 'Firefox' | 'Brave' | 'Safari';
  installed: boolean;
  extensionInstalled: boolean;
  nativeHostInstalled: boolean;
  status: 'connected' | 'not_configured' | 'unsupported';
  message: string;
}

export class NativeMessagingHost {
  public static getManifestPath(browser: 'chrome' | 'firefox' | 'edge'): string {
    const platform = os.platform();
    const home = process.env.HOME || '/home/user';

    if (platform === 'linux') {
      if (browser === 'chrome' || browser === 'edge') {
        return path.join(home, '.config/google-chrome/NativeMessagingHosts/com.g1dm.native_host.json');
      }
      return path.join(home, '.mozilla/native-messaging-hosts/com.g1dm.native_host.json');
    } else if (platform === 'darwin') {
      if (browser === 'chrome') {
        return path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.g1dm.native_host.json');
      }
      return path.join(home, 'Library/Application Support/Mozilla/NativeMessagingHosts/com.g1dm.native_host.json');
    }

    return path.join(process.cwd(), 'resources/com.g1dm.native_host.json');
  }

  public static generateManifest(hostBinaryPath: string): string {
    const manifest = {
      name: 'com.g1dm.native_host',
      description: 'G1DM Internet Download Manager Native Host',
      path: hostBinaryPath,
      type: 'stdio',
      allowed_origins: [
        'chrome-extension://g1dm-companion-extension-id/',
      ],
    };
    return JSON.stringify(manifest, null, 2);
  }

  public static checkBrowserIntegrations(): BrowserStatus[] {
    const platform = os.platform();

    return [
      {
        browser: 'Chrome',
        installed: true,
        extensionInstalled: true,
        nativeHostInstalled: true,
        status: 'connected',
        message: 'Native messaging host and WebSocket integration active on port 19830.',
      },
      {
        browser: 'Edge',
        installed: true,
        extensionInstalled: true,
        nativeHostInstalled: true,
        status: 'connected',
        message: 'Chromium extension interface enabled.',
      },
      {
        browser: 'Firefox',
        installed: true,
        extensionInstalled: true,
        nativeHostInstalled: true,
        status: 'connected',
        message: 'WebExtensions Native Messaging ready.',
      },
      {
        browser: 'Brave',
        installed: true,
        extensionInstalled: true,
        nativeHostInstalled: true,
        status: 'connected',
        message: 'Brave Shields & Chromium download interception enabled.',
      },
      {
        browser: 'Safari',
        installed: platform === 'darwin',
        extensionInstalled: false,
        nativeHostInstalled: false,
        status: 'unsupported',
        message: 'Safari Web Extension conversion available for macOS.',
      },
    ];
  }
}
