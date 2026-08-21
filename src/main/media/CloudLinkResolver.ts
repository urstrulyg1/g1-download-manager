export interface CloudResolvedResource {
  originalUrl: string;
  directDownloadUrl: string;
  filename: string;
  provider: 'GoogleDrive' | 'Dropbox' | 'OneDrive' | 'MediaFire' | 'GitHub' | 'GenericCloud';
  sizeBytes?: number;
  isFolder: boolean;
  folderItems?: { name: string; url: string; size?: number }[];
  requiresAuth: boolean;
  notes?: string;
}

export class CloudLinkResolver {
  /**
   * Detects and resolves a cloud storage / file host URL to a direct downloadable stream URL.
   */
  public static resolve(url: string): CloudResolvedResource {
    const trimmed = url.trim();

    // 1. Google Drive
    if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
      const fileIdMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        const fileId = fileIdMatch[1];
        const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
        return {
          originalUrl: trimmed,
          directDownloadUrl: directUrl,
          filename: `gdrive_file_${fileId}`,
          provider: 'GoogleDrive',
          isFolder: false,
          requiresAuth: false,
          notes: 'Google Drive direct export link with confirmation token',
        };
      }

      // Check if folder
      const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        return {
          originalUrl: trimmed,
          directDownloadUrl: trimmed,
          filename: `gdrive_folder_${folderMatch[1]}`,
          provider: 'GoogleDrive',
          isFolder: true,
          requiresAuth: false,
          notes: 'Google Drive public folder',
        };
      }
    }

    // 2. Dropbox
    if (trimmed.includes('dropbox.com')) {
      let directUrl = trimmed;
      if (trimmed.includes('?dl=0')) {
        directUrl = trimmed.replace('?dl=0', '?dl=1');
      } else if (!trimmed.includes('dl=1')) {
        directUrl = trimmed + (trimmed.includes('?') ? '&dl=1' : '?dl=1');
      }
      directUrl = directUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');

      const urlObj = new URL(trimmed);
      const name = urlObj.pathname.split('/').pop() || 'dropbox_file';

      return {
        originalUrl: trimmed,
        directDownloadUrl: directUrl,
        filename: name,
        provider: 'Dropbox',
        isFolder: trimmed.includes('/sh/'),
        requiresAuth: false,
        notes: 'Dropbox direct content stream link',
      };
    }

    // 3. GitHub Releases & Raw Files
    if (trimmed.includes('github.com') || trimmed.includes('raw.githubusercontent.com')) {
      let directUrl = trimmed;
      if (trimmed.includes('/blob/')) {
        directUrl = trimmed.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
      }
      const name = directUrl.split('/').pop()?.split('?')[0] || 'github_asset';
      return {
        originalUrl: trimmed,
        directDownloadUrl: directUrl,
        filename: name,
        provider: 'GitHub',
        isFolder: false,
        requiresAuth: false,
        notes: 'GitHub raw asset stream',
      };
    }

    // 4. MediaFire
    if (trimmed.includes('mediafire.com')) {
      const name = trimmed.split('/').pop() || 'mediafire_file';
      return {
        originalUrl: trimmed,
        directDownloadUrl: trimmed,
        filename: name,
        provider: 'MediaFire',
        isFolder: false,
        requiresAuth: false,
        notes: 'MediaFire download page',
      };
    }

    // Generic fallback
    const parsed = new URL(trimmed);
    const filename = parsed.pathname.split('/').pop() || 'download';
    return {
      originalUrl: trimmed,
      directDownloadUrl: trimmed,
      filename,
      provider: 'GenericCloud',
      isFolder: false,
      requiresAuth: false,
    };
  }

  /**
   * Tests if a given URL is a supported cloud host URL.
   */
  public static isCloudUrl(url: string): boolean {
    if (!url) return false;
    const cloudDomains = [
      'drive.google.com',
      'docs.google.com',
      'dropbox.com',
      'dl.dropboxusercontent.com',
      '1drv.ms',
      'onedrive.live.com',
      'mediafire.com',
      'mega.nz',
      'github.com',
      'raw.githubusercontent.com',
    ];
    try {
      const parsed = new URL(url);
      return cloudDomains.some((d) => parsed.hostname.includes(d));
    } catch {
      return false;
    }
  }
}
