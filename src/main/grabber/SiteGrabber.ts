import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { EventEmitter } from 'events';
import { SiteGrabberProject, SiteGrabberDiscoveredUrl } from '../../shared/types';
import { AppDatabase } from '../db/Database';
import { DownloadEngine } from '../engine/DownloadEngine';
import { UrlGuard } from '../security/UrlGuard';

export class SiteGrabber extends EventEmitter {
  private db: AppDatabase;
  private engine: DownloadEngine;
  private activeProjects: Map<string, boolean> = new Map();

  constructor(db: AppDatabase, engine: DownloadEngine) {
    super();
    this.db = db;
    this.engine = engine;
  }

  public async startProject(projectId: string): Promise<void> {
    const project = this.db.getGrabberProjects().find((p) => p.id === projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    project.status = 'crawling';
    this.db.saveGrabberProject(project);
    this.activeProjects.set(projectId, true);
    this.emit('project_updated', project);

    this.crawl(project).catch((err) => {
      project.status = 'failed';
      project.error = err.message;
      this.db.saveGrabberProject(project);
      this.activeProjects.delete(projectId);
      this.emit('project_updated', project);
    });
  }

  public stopProject(projectId: string): void {
    this.activeProjects.delete(projectId);
    const project = this.db.getGrabberProjects().find((p) => p.id === projectId);
    if (project) {
      project.status = 'paused';
      this.db.saveGrabberProject(project);
      this.emit('project_updated', project);
    }
  }

  private async crawl(project: SiteGrabberProject): Promise<void> {
    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: project.startUrl, depth: 0 }];
    const baseHost = new URL(project.startUrl).hostname;

    while (queue.length > 0) {
      if (!this.activeProjects.get(project.id)) break;

      const current = queue.shift()!;
      if (visited.has(current.url)) continue;
      visited.add(current.url);

      try {
        const html = await this.fetchHtml(current.url);
        const links = this.extractLinks(html, current.url);

        for (const link of links) {
          if (visited.has(link)) continue;

          try {
            const linkParsed = new URL(link);
            const linkHost = linkParsed.hostname;

            // Check domain rules
            if (project.stayOnDomain) {
              if (project.allowSubdomains) {
                if (!linkHost.endsWith(baseHost) && linkHost !== baseHost) continue;
              } else {
                if (linkHost !== baseHost) continue;
              }
            }

            const ext = path.extname(linkParsed.pathname).toLowerCase().replace('.', '');
            const isPage = ext === '' || ext === 'html' || ext === 'htm' || ext === 'php' || ext === 'asp';

            // Filter check
            let matchesFilter = true;
            if (project.filters.includeExtensions.length > 0) {
              matchesFilter = project.filters.includeExtensions.includes(ext);
            }
            if (project.filters.excludeExtensions.length > 0) {
              if (project.filters.excludeExtensions.includes(ext)) {
                matchesFilter = false;
              }
            }

            // Record discovered URL
            const existing = project.discoveredUrls.find((d) => d.url === link);
            if (!existing) {
              const discoveredItem: SiteGrabberDiscoveredUrl = {
                url: link,
                depth: current.depth + 1,
                status: matchesFilter && !isPage ? 'enqueued' : isPage ? 'discovered' : 'skipped',
                path: linkParsed.pathname,
              };
              project.discoveredUrls.push(discoveredItem);
              project.totalDiscovered = project.discoveredUrls.length;

              // Enqueue file for download if matches filters and is an asset
              if (matchesFilter && !isPage && current.depth + 1 <= project.maxDepth) {
                this.engine
                  .addDownload({
                    url: link,
                    destinationDir: project.destinationDir,
                    category: 'document',
                    startImmediately: true,
                  })
                  .then(() => {
                    discoveredItem.status = 'downloaded';
                    project.totalDownloaded++;
                    this.db.saveGrabberProject(project);
                    this.emit('project_updated', project);
                  })
                  .catch((err) => {
                    discoveredItem.status = 'failed';
                    discoveredItem.error = err.message;
                    this.db.saveGrabberProject(project);
                    this.emit('project_updated', project);
                  });
              }
            }

            // Recurse pages if depth allows
            if (isPage && current.depth + 1 <= project.maxDepth) {
              queue.push({ url: link, depth: current.depth + 1 });
            }
          } catch {
            // ignore invalid url
          }
        }

        this.db.saveGrabberProject(project);
        this.emit('project_updated', project);
      } catch (err: any) {
        // Page crawl error
      }
    }

    if (this.activeProjects.get(project.id)) {
      project.status = 'completed';
      this.db.saveGrabberProject(project);
      this.activeProjects.delete(project.id);
      this.emit('project_updated', project);
    }
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    const urls = new Set<string>();
    const linkRegex = /(?:href|src|data-src)=["']([^"'#\s]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const raw = match[1];
      if (!raw || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
        continue;
      }
      try {
        const abs = new URL(raw, baseUrl).href;
        urls.add(abs);
      } catch {
        // ignore
      }
    }

    return Array.from(urls);
  }

  private async fetchHtml(targetUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) G1DM-Grabber/1.0',
            'Accept': 'text/html,*/*',
          },
          timeout: 10000,
        },
        async (res) => {
          if (
            (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
            res.headers.location
          ) {
            try {
              const redirect = new URL(res.headers.location, targetUrl).href;
              if (process.env.G1DM_E2E !== '1') {
                await UrlGuard.assertSafePublicUrl(redirect);
              }
              this.fetchHtml(redirect).then(resolve).catch(reject);
              return;
            } catch (err) {
              reject(err);
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) res.destroy();
          });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
    });
  }
}
