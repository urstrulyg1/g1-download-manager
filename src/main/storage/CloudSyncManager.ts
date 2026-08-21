import * as fs from 'fs';
import * as path from 'path';

export interface CloudTarget {
  provider: 'gdrive' | 'dropbox' | 's3' | 'nextcloud' | 'local_nas';
  config: {
    accessToken?: string;
    endpoint?: string;
    bucketName?: string;
    nasPath?: string;
  };
}

/**
 * Cloud / NAS upload.
 *
 *  - `local_nas`: real filesystem copy.
 *  - `nextcloud`: real upload over the WebDAV API.
 *  - `gdrive` / `dropbox` / `s3`: these require OAuth / SDK credentials that
 *    G1DM does not bundle. Instead of fabricating a "cloud://" result, they
 *    raise a clear configuration error.
 */
export class CloudSyncManager {
  public static async uploadToCloud(
    filePath: string,
    target: CloudTarget
  ): Promise<{ success: boolean; remotePath: string; bytesUploaded: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);

    switch (target.provider) {
      case 'local_nas': {
        if (!target.config.nasPath) {
          throw new Error('A nasPath must be configured for local_nas uploads');
        }
        if (!fs.existsSync(target.config.nasPath)) {
          fs.mkdirSync(target.config.nasPath, { recursive: true });
        }
        const destination = path.join(target.config.nasPath, filename);
        fs.copyFileSync(filePath, destination);
        return { success: true, remotePath: destination, bytesUploaded: stats.size };
      }
      case 'nextcloud': {
        return CloudSyncManager.uploadWebDav(filePath, target, filename, stats.size);
      }
      default:
        throw new Error(
          `${target.provider} uploads require SDK/OAuth credentials that are not yet configured. ` +
            `Configure the provider integration before uploading.`
        );
    }
  }

  private static async uploadWebDav(
    filePath: string,
    target: CloudTarget,
    filename: string,
    size: number
  ): Promise<{ success: boolean; remotePath: string; bytesUploaded: number }> {
    if (!target.config.endpoint) {
      throw new Error('A WebDAV endpoint must be configured for nextcloud uploads');
    }
    const endpoint = target.config.endpoint.replace(/\/$/, '');
    const remoteUrl = `${endpoint}/${encodeURIComponent(filename)}`;

    const data = fs.readFileSync(filePath);
    const res = await fetch(remoteUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(target.config.accessToken
          ? { Authorization: `Bearer ${target.config.accessToken}` }
          : {}),
      },
      body: data,
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`Nextcloud upload failed (HTTP ${res.status})`);
    }

    return { success: true, remotePath: remoteUrl, bytesUploaded: size };
  }
}
