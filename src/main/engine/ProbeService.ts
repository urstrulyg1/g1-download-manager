import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as path from 'path';
import * as mime from 'mime-types';
import { Client as FtpClient } from 'basic-ftp';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ServerCapabilities, DownloadAuth, ProxyConfig } from '../../shared/types';
import { MaliciousLinkScanner, UrlSafetyScanResult } from '../security/MaliciousLinkScanner';

export interface ProbeResult {
  filename: string;
  suggestedCategory: string;
  capabilities: ServerCapabilities;
  mimeType: string;
  size: number;
  safetyWarning?: UrlSafetyScanResult;
}

export class ProbeService {
  public static sanitizeFilename(rawName: string, fallback: string = 'download'): string {
    let name = rawName.trim();
    // Remove query params or fragments if accidentally present
    name = name.split('?')[0].split('#')[0];
    // Remove path traversal and illegal chars
    name = path.basename(name);
    name = name.replace(/[/\\?%*:|"<>]/g, '_');
    // Remove control characters
    name = name.replace(/[\x00-\x1f\x80-\x9f]/g, '');
    if (!name || name === '.' || name === '..') {
      name = fallback;
    }
    return name;
  }

  public static extractFilenameFromUrl(targetUrl: string, contentType?: string): string {
    try {
      const parsed = new URL(targetUrl);
      const pathname = parsed.pathname;
      const base = path.basename(pathname);
      if (base && base.length > 0 && !base.endsWith('/')) {
        return this.sanitizeFilename(decodeURIComponent(base));
      }
    } catch {
      // ignore
    }

    const ext = contentType ? mime.extension(contentType) : 'bin';
    return `download_${Date.now()}.${ext || 'bin'}`;
  }

  public static extractFilenameFromHeaders(contentDisposition?: string): string | null {
    if (!contentDisposition) return null;

    // Try RFC 5987 filename*
    const rfc5987Match = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (rfc5987Match && rfc5987Match[1]) {
      try {
        const decoded = decodeURIComponent(rfc5987Match[1].replace(/["']/g, ''));
        return this.sanitizeFilename(decoded);
      } catch {
        // fallback
      }
    }

    // Try standard filename
    const match = contentDisposition.match(/filename=(?:"([^"]+)"|([^;\s]+))/i);
    if (match) {
      const name = match[1] || match[2];
      if (name) {
        return this.sanitizeFilename(name);
      }
    }

    return null;
  }

  public static categorizeFile(filename: string, mimeType?: string): string {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm3u8', '3gp'];
    const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'alac'];
    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub', 'rtf', 'odt', 'ods', 'odp'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'avif', 'heic'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'tgz', 'zst'];
    const progExts = ['exe', 'msi', 'deb', 'rpm', 'appimage', 'apk', 'dmg', 'pkg', 'bin', 'sh', 'bat', 'cmd'];

    if (videoExts.includes(ext) || (mimeType && mimeType.startsWith('video/'))) return 'video';
    if (audioExts.includes(ext) || (mimeType && mimeType.startsWith('audio/'))) return 'audio';
    if (docExts.includes(ext) || (mimeType && (mimeType.startsWith('text/') || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('sheet') || mimeType.includes('presentation')))) return 'document';
    if (imageExts.includes(ext) || (mimeType && mimeType.startsWith('image/'))) return 'image';
    if (archiveExts.includes(ext) || (mimeType && (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed') || mimeType.includes('archive')))) return 'archive';
    if (progExts.includes(ext)) return 'program';

    return 'other';
  }

  public static async probe(
    targetUrl: string,
    auth?: DownloadAuth,
    proxy?: ProxyConfig,
    timeoutMs: number = 15000
  ): Promise<ProbeResult> {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol.replace(':', '').toLowerCase();

    let probeRes: ProbeResult;
    if (protocol === 'ftp' || protocol === 'ftps') {
      probeRes = await this.probeFtp(targetUrl, auth, timeoutMs);
    } else {
      probeRes = await this.probeHttp(targetUrl, auth, proxy, timeoutMs);
    }

    // Perform Pre-Download Malicious Link Scan
    const safetyWarning = MaliciousLinkScanner.scanUrl(targetUrl, probeRes);
    probeRes.safetyWarning = safetyWarning;

    return probeRes;
  }

  private static async probeFtp(
    targetUrl: string,
    auth?: DownloadAuth,
    timeoutMs: number = 15000
  ): Promise<ProbeResult> {
    const parsed = new URL(targetUrl);
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

      const filePath = parsed.pathname;
      const size = await client.size(filePath).catch(() => -1);
      const filename = this.extractFilenameFromUrl(targetUrl);
      const mimeType = (mime.lookup(filename) as string) || 'application/octet-stream';
      const category = this.categorizeFile(filename, mimeType);

      client.close();

      return {
        filename,
        suggestedCategory: category,
        mimeType,
        size: size > 0 ? size : -1,
        capabilities: {
          supportsRange: true,
          contentLength: size > 0 ? size : undefined,
          contentType: mimeType,
          redirectChain: [targetUrl],
          protocol: parsed.protocol === 'ftps:' ? 'ftps' : 'ftp',
          authRequired: Boolean(auth?.username || parsed.username),
          probedAt: Date.now(),
        },
      };
    } catch (err: any) {
      client.close();
      const filename = this.extractFilenameFromUrl(targetUrl);
      return {
        filename,
        suggestedCategory: this.categorizeFile(filename),
        mimeType: 'application/octet-stream',
        size: -1,
        capabilities: {
          supportsRange: false,
          redirectChain: [targetUrl],
          protocol: parsed.protocol === 'ftps:' ? 'ftps' : 'ftp',
          authRequired: Boolean(auth?.username || parsed.username),
          probedAt: Date.now(),
        },
      };
    }
  }

  private static async probeHttp(
    initialUrl: string,
    auth?: DownloadAuth,
    proxy?: ProxyConfig,
    timeoutMs: number = 15000
  ): Promise<ProbeResult> {
    let currentUrl = initialUrl;
    const redirectChain: string[] = [initialUrl];
    let maxRedirects = 10;
    let finalHeaders: http.IncomingHttpHeaders = {};
    let finalStatusCode = 200;
    let supportsRange = false;
    let tlsCipher: string | undefined;
    let tlsVersion: string | undefined;

    while (maxRedirects > 0) {
      maxRedirects--;
      const parsed = new URL(currentUrl);
      const isHttps = parsed.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      // Prepare headers
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 G1DM/1.0',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Range': 'bytes=0-0',
        ...(auth?.customHeaders || {}),
      };

      if (auth?.cookies) {
        headers['Cookie'] = auth.cookies;
      }

      if (auth?.username && auth?.password) {
        const creds = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${creds}`;
      } else if (auth?.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      }

      // Configure Proxy Agent if specified
      let agent: http.Agent | https.Agent | undefined;
      if (proxy && proxy.enabled && proxy.host) {
        const proxyUri = `${proxy.type}://${proxy.auth && proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
        if (proxy.type === 'socks5') {
          agent = new SocksProxyAgent(proxyUri);
        } else {
          agent = new HttpsProxyAgent(proxyUri);
        }
      }

      const reqOptions: https.RequestOptions = {
        method: 'GET',
        headers,
        timeout: timeoutMs,
        agent,
        rejectUnauthorized: false,
      };

      const probeResponse = await new Promise<{
        statusCode: number;
        headers: http.IncomingHttpHeaders;
        tlsInfo?: { cipher?: string; version?: string };
        redirectUrl?: string;
      }>((resolve, reject) => {
        const req = requestModule.request(currentUrl, reqOptions, (res) => {
          const resHeaders = res.headers;
          const resStatusCode = res.statusCode || 200;

          let tlsInfo: { cipher?: string; version?: string } | undefined;
          if (isHttps && (res.socket as any).getPeerCertificate) {
            const tlsSocket = res.socket as any;
            const cipher = tlsSocket.getCipher ? tlsSocket.getCipher() : undefined;
            const version = tlsSocket.getProtocol ? tlsSocket.getProtocol() : undefined;
            tlsInfo = {
              cipher: cipher ? `${cipher.name} (${cipher.standardName || cipher.version})` : undefined,
              version: version || undefined,
            };
          }

          res.destroy();

          if (
            (resStatusCode === 301 ||
              resStatusCode === 302 ||
              resStatusCode === 303 ||
              resStatusCode === 307 ||
              resStatusCode === 308) &&
            resHeaders.location
          ) {
            const resolvedLocation = new URL(resHeaders.location, currentUrl).href;
            resolve({
              statusCode: resStatusCode,
              headers: resHeaders,
              tlsInfo,
              redirectUrl: resolvedLocation,
            });
            return;
          }

          resolve({
            statusCode: resStatusCode,
            headers: resHeaders,
            tlsInfo,
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error(`Probe request timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.end();
      });

      if (probeResponse.tlsInfo) {
        tlsCipher = probeResponse.tlsInfo.cipher;
        tlsVersion = probeResponse.tlsInfo.version;
      }

      if (probeResponse.redirectUrl) {
        currentUrl = probeResponse.redirectUrl;
        redirectChain.push(currentUrl);
        continue;
      }

      finalHeaders = probeResponse.headers;
      finalStatusCode = probeResponse.statusCode;
      break;
    }

    if (finalStatusCode === 206) {
      supportsRange = true;
    } else if (
      finalHeaders['accept-ranges'] &&
      finalHeaders['accept-ranges'].toLowerCase().includes('bytes')
    ) {
      supportsRange = true;
    }

    let totalSize = -1;
    if (finalHeaders['content-range']) {
      const crMatch = finalHeaders['content-range'].match(/\/(\d+|\*)/);
      if (crMatch && crMatch[1] && crMatch[1] !== '*') {
        totalSize = parseInt(crMatch[1], 10);
      }
    }

    if (totalSize <= 0 && finalHeaders['content-length']) {
      totalSize = parseInt(finalHeaders['content-length'], 10);
    }

    const contentType = finalHeaders['content-type'] ? finalHeaders['content-type'].split(';')[0].trim() : undefined;
    const contentDisposition = finalHeaders['content-disposition'];

    let filename = this.extractFilenameFromHeaders(contentDisposition);
    if (!filename) {
      filename = this.extractFilenameFromUrl(currentUrl, contentType);
    }

    const mimeType = contentType || (mime.lookup(filename) as string) || 'application/octet-stream';
    const category = this.categorizeFile(filename, mimeType);

    const isHls = filename.endsWith('.m3u8') || mimeType.includes('mpegurl');

    return {
      filename,
      suggestedCategory: category,
      mimeType,
      size: totalSize > 0 ? totalSize : -1,
      capabilities: {
        supportsRange: isHls ? false : supportsRange,
        acceptRangesHeader: Array.isArray(finalHeaders['accept-ranges']) ? finalHeaders['accept-ranges'].join(', ') : finalHeaders['accept-ranges'],
        contentLength: totalSize > 0 ? totalSize : undefined,
        contentType: mimeType,
        etag: Array.isArray(finalHeaders['etag']) ? finalHeaders['etag'][0] : finalHeaders['etag'],
        lastModified: Array.isArray(finalHeaders['last-modified']) ? finalHeaders['last-modified'][0] : finalHeaders['last-modified'],
        transferEncoding: Array.isArray(finalHeaders['transfer-encoding']) ? finalHeaders['transfer-encoding'].join(', ') : finalHeaders['transfer-encoding'],
        redirectChain,
        httpStatus: finalStatusCode,
        protocol: isHls ? 'hls' : initialUrl.startsWith('https:') ? 'https' : 'http',
        authRequired: finalStatusCode === 401 || finalStatusCode === 403,
        tlsCipher,
        tlsVersion,
        serverSoftware: Array.isArray(finalHeaders['server']) ? finalHeaders['server'].join(', ') : finalHeaders['server'],
        probedAt: Date.now(),
      },
    };
  }
}
