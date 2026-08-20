import * as fs from 'fs';
import * as path from 'path';
import { Client as FtpClient, FileInfo } from 'basic-ftp';
import { DownloadAuth } from '../../shared/types';

export interface FtpEntry {
  name: string;
  type: 'file' | 'directory' | 'symbolic-link' | 'unknown';
  size: number;
  rawModifiedAt: string;
  modifiedAtMs: number;
  permissions?: string;
}

export class FtpManager {
  public static async listDirectory(
    ftpUrl: string,
    auth?: DownloadAuth,
    timeoutMs: number = 15000
  ): Promise<FtpEntry[]> {
    const parsed = new URL(ftpUrl);
    const client = new FtpClient(timeoutMs);
    client.ftp.verbose = false;

    try {
      await client.access({
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 21,
        user: auth?.username || parsed.username || 'anonymous',
        password: auth?.password || parsed.password || 'anonymous@',
        secure: parsed.protocol === 'ftps:',
      });

      const targetPath = parsed.pathname || '/';
      const list: FileInfo[] = await client.list(targetPath);
      client.close();

      return list.map((item) => ({
        name: item.name,
        type: item.isDirectory ? 'directory' : item.isSymbolicLink ? 'symbolic-link' : 'file',
        size: item.size,
        rawModifiedAt: item.rawModifiedAt,
        modifiedAtMs: item.modifiedAt ? item.modifiedAt.getTime() : Date.now(),
        permissions: item.permissions ? JSON.stringify(item.permissions) : undefined,
      }));
    } catch (err: any) {
      client.close();
      throw new Error(`FTP directory list failed: ${err.message}`);
    }
  }

  public static async crawlRecursive(
    rootUrl: string,
    auth?: DownloadAuth,
    timeoutMs: number = 20000
  ): Promise<{ url: string; relativePath: string; size: number }[]> {
    const parsed = new URL(rootUrl);
    const client = new FtpClient(timeoutMs);
    client.ftp.verbose = false;

    const discoveredFiles: { url: string; relativePath: string; size: number }[] = [];

    try {
      await client.access({
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 21,
        user: auth?.username || parsed.username || 'anonymous',
        password: auth?.password || parsed.password || 'anonymous@',
        secure: parsed.protocol === 'ftps:',
      });

      const initialPath = parsed.pathname || '/';

      const scanDir = async (currentRemotePath: string, localRelPrefix: string) => {
        const items = await client.list(currentRemotePath);
        for (const item of items) {
          const itemRemotePath = path.posix.join(currentRemotePath, item.name);
          const itemLocalRel = path.join(localRelPrefix, item.name);

          if (item.isDirectory) {
            await scanDir(itemRemotePath, itemLocalRel);
          } else {
            const fileUrl = new URL(rootUrl);
            fileUrl.pathname = itemRemotePath;
            discoveredFiles.push({
              url: fileUrl.href,
              relativePath: itemLocalRel,
              size: item.size,
            });
          }
        }
      };

      await scanDir(initialPath, '');
      client.close();
      return discoveredFiles;
    } catch (err: any) {
      client.close();
      throw err;
    }
  }

  public static preserveTimestamp(localFilePath: string, timestampMs: number): void {
    if (fs.existsSync(localFilePath) && timestampMs > 0) {
      try {
        const time = new Date(timestampMs);
        fs.utimesSync(localFilePath, time, time);
      } catch {
        // ignore utimes failure
      }
    }
  }
}
