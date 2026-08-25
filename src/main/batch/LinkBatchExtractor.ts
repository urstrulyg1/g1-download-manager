import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as mime from 'mime-types';
import { LinkBatchCandidate } from '../../shared/types';
import { ProbeService } from '../engine/ProbeService';
import { UrlGuard } from '../security/UrlGuard';

export class LinkBatchExtractor {
  public static async extractFromUrlOrText(input: string): Promise<LinkBatchCandidate[]> {
    const trimmed = input.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const html = await this.fetchHtml(trimmed);
        return this.extractFromHtml(html, trimmed);
      } catch {
        // Fallback to text parsing if HTML fetch fails
        return this.extractFromRawText(trimmed);
      }
    }

    return this.extractFromRawText(trimmed);
  }

  private static async fetchHtml(targetUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const reqMod = parsed.protocol === 'https:' ? https : http;

      const req = reqMod.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
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

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
            if (data.length > 2 * 1024 * 1024) res.destroy();
          });
          res.on('end', () => resolve(data));
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
    });
  }

  private static extractFromHtml(html: string, baseUrl: string): LinkBatchCandidate[] {
    const rawUrls = new Set<string>();
    const linkRegex = /(?:href|src|data-src)=["']([^"'#\s]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const raw = match[1];
      if (!raw || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:')) {
        continue;
      }
      try {
        const abs = new URL(raw, baseUrl).href;
        rawUrls.add(abs);
      } catch {
        // ignore
      }
    }

    return this.buildCandidates(Array.from(rawUrls));
  }

  private static extractFromRawText(text: string): LinkBatchCandidate[] {
    const rawUrls = new Set<string>();
    const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      rawUrls.add(match[0]);
    }

    return this.buildCandidates(Array.from(rawUrls));
  }

  private static buildCandidates(urls: string[]): LinkBatchCandidate[] {
    const candidates: LinkBatchCandidate[] = [];

    for (const urlStr of urls) {
      try {
        const parsed = new URL(urlStr);
        const filename = ProbeService.extractFilenameFromUrl(urlStr);
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const mimeType = (mime.lookup(filename) as string) || 'application/octet-stream';
        const category = ProbeService.categorizeFile(filename, mimeType);

        candidates.push({
          url: urlStr,
          filename,
          extension: ext,
          mimeType,
          category,
          selected: true,
        });
      } catch {
        // ignore invalid URL
      }
    }

    return candidates;
  }
}
