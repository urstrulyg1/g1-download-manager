import { Priority } from '../../shared/types';

export interface DownloadTemplate {
  id: string;
  name: string;
  category: string;
  destinationDir: string;
  profileId: string;
  priority: Priority;
  maxConnections: number;
  checksumAlgo?: 'sha256' | 'sha512' | 'md5';
  tags: string[];
}

export interface FavoriteBookmark {
  id: string;
  title: string;
  url: string;
  templateId?: string;
  tags: string[];
  createdAt: number;
}

export class TemplateManager {
  private templates: Map<string, DownloadTemplate> = new Map();
  private favorites: Map<string, FavoriteBookmark> = new Map();

  constructor() {
    this.addTemplate({
      id: 'tpl_linux_iso',
      name: 'Linux ISOs (Safe & Verified)',
      category: 'archive',
      destinationDir: '/home/user/Downloads/ISOs',
      profileId: 'SAFE',
      priority: 'high',
      maxConnections: 8,
      checksumAlgo: 'sha256',
      tags: ['linux', 'iso', 'os'],
    });

    this.addTemplate({
      id: 'tpl_hd_video',
      name: 'HD Media & Movies (Turbo)',
      category: 'video',
      destinationDir: '/home/user/Videos',
      profileId: 'TURBO',
      priority: 'normal',
      maxConnections: 16,
      tags: ['movies', 'video', 'hd'],
    });
  }

  public addTemplate(template: DownloadTemplate): void {
    this.templates.set(template.id, template);
  }

  public getTemplates(): DownloadTemplate[] {
    return Array.from(this.templates.values());
  }

  public addFavorite(fav: Omit<FavoriteBookmark, 'id' | 'createdAt'>): FavoriteBookmark {
    const id = `fav_${Date.now()}`;
    const full: FavoriteBookmark = {
      ...fav,
      id,
      createdAt: Date.now(),
    };
    this.favorites.set(id, full);
    return full;
  }

  public getFavorites(): FavoriteBookmark[] {
    return Array.from(this.favorites.values());
  }
}
