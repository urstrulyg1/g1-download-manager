import * as os from 'os';

export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'unknown';
export type CpuArchitecture = 'x64' | 'arm64' | 'ia32' | 'arm' | 'unknown';

export interface PlatformCapabilityReport {
  os: OperatingSystem;
  osRelease: string;
  arch: CpuArchitecture;
  isWindows: boolean;
  isMac: boolean;
  isLinux: boolean;
  features: {
    atomicRename: boolean;
    sparseFiles: boolean;
    caseSensitiveFilesystem: boolean;
    nativeCredentialsVault: boolean;
    nativeDesktopNotifications: boolean;
    batteryStateDetection: boolean;
    systemTray: boolean;
    networkInterfaceDetection: boolean;
    ffmpegHardwareAcceleration: boolean;
  };
}

export class PlatformCapabilities {
  public static getPlatform(): OperatingSystem {
    const p = process.platform;
    if (p === 'win32') return 'windows';
    if (p === 'darwin') return 'macos';
    if (p === 'linux') return 'linux';
    return 'unknown';
  }

  public static getArchitecture(): CpuArchitecture {
    const a = process.arch;
    if (a === 'x64') return 'x64';
    if (a === 'arm64') return 'arm64';
    if (a === 'ia32') return 'ia32';
    if (a === 'arm') return 'arm';
    return 'unknown';
  }

  public static getReport(): PlatformCapabilityReport {
    const platform = this.getPlatform();
    const arch = this.getArchitecture();

    return {
      os: platform,
      osRelease: os.release(),
      arch,
      isWindows: platform === 'windows',
      isMac: platform === 'macos',
      isLinux: platform === 'linux',
      features: {
        atomicRename: true,
        sparseFiles: platform !== 'windows' || true,
        caseSensitiveFilesystem: platform === 'linux',
        nativeCredentialsVault: true,
        nativeDesktopNotifications: true,
        batteryStateDetection: true,
        systemTray: true,
        networkInterfaceDetection: true,
        ffmpegHardwareAcceleration: true,
      },
    };
  }
}
