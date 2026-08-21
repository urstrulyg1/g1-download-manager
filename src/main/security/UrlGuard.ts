import * as dns from 'dns';
import * as net from 'net';

/**
 * SSRF protection for server-side fetches.
 *
 * Several endpoints (`/api/probe`, `/api/media/*`, `/api/batch/extract`,
 * `/api/cloud/resolve`, …) fetch arbitrary user-supplied URLs from the
 * backend process. Without validation an attacker could reach internal
 * services (`http://169.254.169.254`, `http://127.0.0.1:…`, RFC-1918 ranges)
 * through the download manager.
 *
 * `assertSafePublicUrl()` resolves the hostname to IP addresses and rejects
 * loopback, link-local, private, and other non-public ranges before any
 * network request is made.
 */

export class UrlGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlGuardError';
  }
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  // 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (link-local, incl. cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 192.168.0.0/16, 198.18/15, 198.51.100/24, 203.0.113/24
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)
  if (a >= 224) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((n) => parseInt(n, 10));
    if (octets.every((n) => !Number.isNaN(n) && n >= 0 && n <= 255)) {
      return isPrivateIpv4(octets);
    }
    return true;
  }
  // IPv6: loopback, link-local, unique-local (fc00::/7), and unspecified.
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.substring('::ffff:'.length);
    if (mapped.includes('.')) return isPrivateIp(mapped);
  }
  return false;
}

export class UrlGuard {
  private static readonly ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

  /**
   * Validates a URL for server-side fetching. Rejects non-HTTP(S) protocols
   * and any hostname that resolves to a private / loopback / link-local /
   * reserved address (SSRF defence). Optionally skips the DNS resolution step
   * for tests that pass synthetic hosts.
   */
  public static async assertSafePublicUrl(
    rawUrl: string,
    opts: { skipDnsResolution?: boolean } = {}
  ): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new UrlGuardError('Invalid URL');
    }

    if (!UrlGuard.ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new UrlGuardError(`Unsupported protocol: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      throw new UrlGuardError('URL has no hostname');
    }

    // Fast path: reject obviously-private literals without a DNS lookup.
    if (hostname === 'localhost' || hostname === 'localhost.localdomain' || hostname.endsWith('.localhost')) {
      throw new UrlGuardError('Requests to localhost are not allowed');
    }
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        throw new UrlGuardError('Requests to private / loopback addresses are not allowed');
      }
      return parsed;
    }

    if (opts.skipDnsResolution) {
      return parsed;
    }

    let addresses: string[] = [];
    try {
      addresses = await dns.promises.resolve4(hostname).catch(() => []);
      const ipv6 = await dns.promises.resolve6(hostname).catch(() => []);
      addresses = addresses.concat(ipv6);
    } catch {
      throw new UrlGuardError('Could not resolve hostname');
    }

    if (addresses.length === 0) {
      throw new UrlGuardError('Hostname did not resolve to any address');
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new UrlGuardError(`Hostname resolves to a private address (${addr}) — request blocked`);
      }
    }

    return parsed;
  }

  /** Synchronous sanity check used for quick pre-validation. */
  public static isHttpUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      return UrlGuard.ALLOWED_PROTOCOLS.has(parsed.protocol);
    } catch {
      return false;
    }
  }
}
