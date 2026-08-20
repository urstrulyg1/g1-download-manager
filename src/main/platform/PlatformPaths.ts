import * as path from 'path';
import * as os from 'os';
import { PlatformCapabilities } from './PlatformCapabilities';

export class PlatformPaths {
  public static getHomeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || '/home/user';
  }

  public static getDefaultDownloadsDir(): string {
    return path.join(this.getHomeDir(), 'Downloads');
  }

  public static getAppDataDir(): string {
    const platform = PlatformCapabilities.getPlatform();
    const home = this.getHomeDir();

    if (platform === 'windows') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'G1DM');
    }
    if (platform === 'macos') {
      return path.join(home, 'Library', 'Application Support', 'G1DM');
    }
    // Linux / XDG
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(xdgConfig, 'g1dm');
  }

  public static getTempDir(): string {
    return os.tmpdir();
  }

  public static getNativeMessagingPath(browser: 'chrome' | 'edge' | 'firefox' | 'brave'): string {
    const platform = PlatformCapabilities.getPlatform();
    const home = this.getHomeDir();

    if (platform === 'windows') {
      const appData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      if (browser === 'firefox') {
        return path.join(appData, 'Mozilla', 'NativeMessagingHosts', 'com.g1dm.native_host.json');
      }
      return path.join(appData, 'Google', 'Chrome', 'User Data', 'NativeMessagingHosts', 'com.g1dm.native_host.json');
    }

    if (platform === 'macos') {
      if (browser === 'firefox') {
        return path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts', 'com.g1dm.native_host.json');
      }
      return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'com.g1dm.native_host.json');
    }

    // Linux
    if (browser === 'firefox') {
      return path.join(home, '.mozilla', 'native-messaging-hosts', 'com.g1dm.native_host.json');
    }
    return path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.g1dm.native_host.json');
  }
}
