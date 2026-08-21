import * as crypto from 'crypto';

export interface ThreatIntelVerdict {
  url: string;
  checkedAt: number;
  sources: {
    provider: 'virustotal' | 'urlhaus';
    queried: boolean;
    verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'error';
    detail: string;
    positives?: number;
    total?: number;
    threatType?: string;
  }[];
  overallVerdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  riskScoreDelta: number; // added to the local MaliciousLinkScanner risk score
}

/**
 * Cloud reputation lookups against real threat-intelligence APIs.
 *
 * - URLhaus (abuse.ch): free, no API key required. Looks up the exact URL
 *   against the live malware-distribution database.
 * - VirusTotal v3: optional API key. Looks up the URL identifier (base64url
 *   of the URL, per VT docs) and aggregates the analysis stats.
 *
 * Both lookups are best-effort with short timeouts and an in-memory cache so
 * the probe path never blocks on a slow third-party API.
 */
export class ThreatIntelService {
  private static cache = new Map<string, { verdict: ThreatIntelVerdict; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000;
  private static readonly TIMEOUT_MS = 6000;

  public static async checkUrl(
    url: string,
    options: { virusTotalApiKey?: string; urlHausEnabled?: boolean } = {}
  ): Promise<ThreatIntelVerdict> {
    const cacheKey = `${url}|${options.virusTotalApiKey ? 'vt' : ''}|${options.urlHausEnabled !== false ? 'uh' : ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.verdict;

    const sources: ThreatIntelVerdict['sources'] = [];

    const tasks: Promise<void>[] = [];
    if (options.urlHausEnabled !== false) {
      tasks.push(
        this.queryUrlHaus(url).then((s) => {
          sources.push(s);
        })
      );
    }
    if (options.virusTotalApiKey) {
      tasks.push(
        this.queryVirusTotal(url, options.virusTotalApiKey).then((s) => {
          sources.push(s);
        })
      );
    }

    await Promise.allSettled(tasks);

    let overall: ThreatIntelVerdict['overallVerdict'] = 'unknown';
    let delta = 0;
    if (sources.some((s) => s.verdict === 'malicious')) {
      overall = 'malicious';
      delta = 70;
    } else if (sources.some((s) => s.verdict === 'suspicious')) {
      overall = 'suspicious';
      delta = 35;
    } else if (sources.some((s) => s.verdict === 'clean')) {
      overall = 'clean';
    }

    const verdict: ThreatIntelVerdict = {
      url,
      checkedAt: Date.now(),
      sources,
      overallVerdict: overall,
      riskScoreDelta: delta,
    };

    this.cache.set(cacheKey, { verdict, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return verdict;
  }

  /** File-hash reputation lookup via VirusTotal (post-download scanning). */
  public static async checkFileHash(
    sha256: string,
    virusTotalApiKey: string
  ): Promise<{ verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown' | 'error'; detail: string; positives?: number; total?: number }> {
    try {
      const res = await this.fetchWithTimeout(`https://www.virustotal.com/api/v3/files/${sha256}`, {
        headers: { 'x-apikey': virusTotalApiKey },
      });
      if (res.status === 404) return { verdict: 'unknown', detail: 'Hash not present in VirusTotal corpus' };
      if (!res.ok) return { verdict: 'error', detail: `VirusTotal HTTP ${res.status}` };

      const json: any = await res.json();
      const stats = json?.data?.attributes?.last_analysis_stats || {};
      const positives = (stats.malicious || 0) + (stats.suspicious || 0);
      const total = Object.values(stats).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

      if ((stats.malicious || 0) >= 3) return { verdict: 'malicious', detail: `${stats.malicious} engines flag this file as malicious`, positives, total };
      if (positives >= 1) return { verdict: 'suspicious', detail: `${positives}/${total} engines raised flags`, positives, total };
      return { verdict: 'clean', detail: `0/${total} engines flagged this file`, positives: 0, total };
    } catch (err: any) {
      return { verdict: 'error', detail: err.message };
    }
  }

  public static sha256OfBuffer(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  public static clearCache(): void {
    this.cache.clear();
  }

  // ------------------------------------------------------------ providers

  private static async queryUrlHaus(url: string): Promise<ThreatIntelVerdict['sources'][number]> {
    try {
      const body = new URLSearchParams({ url });
      const res = await this.fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/url/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        return { provider: 'urlhaus', queried: true, verdict: 'error', detail: `URLhaus HTTP ${res.status}` };
      }
      const json: any = await res.json();

      if (json.query_status === 'no_results') {
        return { provider: 'urlhaus', queried: true, verdict: 'clean', detail: 'URL not present in URLhaus malware database' };
      }
      if (json.query_status === 'ok') {
        const online = json.url_status === 'online';
        return {
          provider: 'urlhaus',
          queried: true,
          verdict: 'malicious',
          detail: `Listed in URLhaus as active malware distribution URL (status: ${json.url_status || 'unknown'}${json.threat ? `, threat: ${json.threat}` : ''})${online ? ' — payload currently ONLINE' : ''}`,
          threatType: json.threat,
        };
      }
      return { provider: 'urlhaus', queried: true, verdict: 'unknown', detail: `URLhaus query status: ${json.query_status}` };
    } catch (err: any) {
      return { provider: 'urlhaus', queried: true, verdict: 'error', detail: `URLhaus unreachable: ${err.message}` };
    }
  }

  private static async queryVirusTotal(url: string, apiKey: string): Promise<ThreatIntelVerdict['sources'][number]> {
    try {
      // VT v3 URL identifier = unpadded base64url of the canonical URL
      const id = Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const res = await this.fetchWithTimeout(`https://www.virustotal.com/api/v3/urls/${id}`, {
        headers: { 'x-apikey': apiKey },
      });

      if (res.status === 404) {
        return { provider: 'virustotal', queried: true, verdict: 'unknown', detail: 'URL not yet analyzed by VirusTotal' };
      }
      if (res.status === 401 || res.status === 403) {
        return { provider: 'virustotal', queried: true, verdict: 'error', detail: 'VirusTotal API key rejected' };
      }
      if (!res.ok) {
        return { provider: 'virustotal', queried: true, verdict: 'error', detail: `VirusTotal HTTP ${res.status}` };
      }

      const json: any = await res.json();
      const stats = json?.data?.attributes?.last_analysis_stats || {};
      const malicious = stats.malicious || 0;
      const suspicious = stats.suspicious || 0;
      const total = Object.values(stats).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

      if (malicious >= 3) {
        return { provider: 'virustotal', queried: true, verdict: 'malicious', detail: `${malicious}/${total} engines flag this URL as malicious`, positives: malicious, total };
      }
      if (malicious + suspicious >= 1) {
        return { provider: 'virustotal', queried: true, verdict: 'suspicious', detail: `${malicious + suspicious}/${total} engines raised flags`, positives: malicious + suspicious, total };
      }
      return { provider: 'virustotal', queried: true, verdict: 'clean', detail: `0/${total} engines flagged this URL`, positives: 0, total };
    } catch (err: any) {
      return { provider: 'virustotal', queried: true, verdict: 'error', detail: `VirusTotal unreachable: ${err.message}` };
    }
  }

  private static fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  }
}
