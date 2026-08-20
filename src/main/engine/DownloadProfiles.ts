export type ProfileType = 'TURBO' | 'NIGHT' | 'WORK' | 'METERED' | 'SAFE' | 'GAMING';

export interface DownloadProfile {
  id: ProfileType;
  name: string;
  icon: string;
  description: string;
  maxConnectionsPerDownload: number;
  maxConcurrentDownloads: number;
  speedLimitBytesPerSec: number;
  dynamicSegmentation: boolean;
  strictVerification: boolean;
  quietMode: boolean;
}

export class DownloadProfilesManager {
  private static readonly PROFILES: Record<ProfileType, DownloadProfile> = {
    TURBO: {
      id: 'TURBO',
      name: 'Turbo Mode',
      icon: 'Rocket',
      description: 'Maximum practical speed with aggressive dynamic segmentation and up to 16 sockets per file.',
      maxConnectionsPerDownload: 16,
      maxConcurrentDownloads: 6,
      speedLimitBytesPerSec: 0, // Unlimited
      dynamicSegmentation: true,
      strictVerification: false,
      quietMode: false,
    },
    NIGHT: {
      id: 'NIGHT',
      name: 'Night Owl',
      icon: 'Moon',
      description: 'Uncapped bandwidth optimized for scheduled overnight downloading.',
      maxConnectionsPerDownload: 12,
      maxConcurrentDownloads: 4,
      speedLimitBytesPerSec: 0,
      dynamicSegmentation: true,
      strictVerification: true,
      quietMode: true,
    },
    WORK: {
      id: 'WORK',
      name: 'Work / Office',
      icon: 'Briefcase',
      description: 'Lightweight bandwidth throttling to prevent interfering with Zoom calls and office browsing.',
      maxConnectionsPerDownload: 4,
      maxConcurrentDownloads: 2,
      speedLimitBytesPerSec: 512 * 1024, // 512 KB/s
      dynamicSegmentation: true,
      strictVerification: true,
      quietMode: true,
    },
    METERED: {
      id: 'METERED',
      name: 'Metered / Mobile',
      icon: 'Smartphone',
      description: 'Strict low bandwidth and connection limits for cellular hotspots and metered connections.',
      maxConnectionsPerDownload: 2,
      maxConcurrentDownloads: 1,
      speedLimitBytesPerSec: 256 * 1024, // 256 KB/s
      dynamicSegmentation: false,
      strictVerification: true,
      quietMode: false,
    },
    SAFE: {
      id: 'SAFE',
      name: 'Safe Mode',
      icon: 'ShieldCheck',
      description: 'Maximum integrity verification, strict ETag validation, and conservative connection counts.',
      maxConnectionsPerDownload: 2,
      maxConcurrentDownloads: 2,
      speedLimitBytesPerSec: 0,
      dynamicSegmentation: false,
      strictVerification: true,
      quietMode: false,
    },
    GAMING: {
      id: 'GAMING',
      name: 'Gaming Mode',
      icon: 'Gamepad2',
      description: 'Minimal background footprint preserving ultra-low network latency for online multiplayer gaming.',
      maxConnectionsPerDownload: 1,
      maxConcurrentDownloads: 1,
      speedLimitBytesPerSec: 100 * 1024, // 100 KB/s
      dynamicSegmentation: false,
      strictVerification: true,
      quietMode: true,
    },
  };

  public static getProfiles(): DownloadProfile[] {
    return Object.values(this.PROFILES);
  }

  public static getProfile(type: ProfileType): DownloadProfile {
    return this.PROFILES[type] || this.PROFILES.TURBO;
  }
}
