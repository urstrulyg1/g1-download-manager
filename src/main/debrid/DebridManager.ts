export interface DebridAccount {
  provider: 'real-debrid' | 'alldebrid' | 'premiumize';
  apiKey: string;
  username?: string;
  isPremium: boolean;
  expirationEpochMs?: number;
}

export interface UnrestrictedLink {
  originalUrl: string;
  downloadUrl: string;
  filename: string;
  filesize: number;
  host: string;
}

/**
 * Debrid provider integration.
 *
 * Talks to the providers' real REST APIs to "unrestrict" hoster links into
 * uncapped direct download URLs:
 *   - Real-Debrid  POST /rest/1.0/unrestrict/link
 *   - AllDebrid    GET  /v4/link/unlock
 *   - Premiumize   POST /api/transfer/directlink
 */
export class DebridManager {
  private static accounts: Map<string, DebridAccount> = new Map();

  public static addAccount(account: DebridAccount) {
    DebridManager.accounts.set(account.provider, account);
  }

  public static getAccount(
    provider: 'real-debrid' | 'alldebrid' | 'premiumize'
  ): DebridAccount | undefined {
    return DebridManager.accounts.get(provider);
  }

  public static async unrestrictLink(
    url: string,
    provider: 'real-debrid' | 'alldebrid' | 'premiumize' = 'real-debrid'
  ): Promise<UnrestrictedLink> {
    const acc = DebridManager.accounts.get(provider);
    if (!acc || !acc.apiKey) {
      throw new Error(`No API key configured for Debrid provider ${provider}`);
    }

    const result =
      provider === 'real-debrid'
        ? await DebridManager.unrestrictRealDebrid(acc.apiKey, url)
        : provider === 'alldebrid'
          ? await DebridManager.unrestrictAllDebrid(acc.apiKey, url)
          : await DebridManager.unrestrictPremiumize(acc.apiKey, url);

    return {
      originalUrl: url,
      downloadUrl: result.download,
      filename: result.filename || url.split('/').pop() || 'debrid_file.bin',
      filesize: result.filesize || 0,
      host: provider,
    };
  }

  private static async unrestrictRealDebrid(
    apiKey: string,
    url: string
  ): Promise<{ download: string; filename?: string; filesize?: number }> {
    const res = await fetch('https://api.real-debrid.com/rest/1.0/unrestrict/link', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ link: url }).toString(),
    });

    if (!res.ok) {
      throw new Error(`Real-Debrid unrestrict failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as {
      download?: string;
      filename?: string;
      filesize?: number;
      error?: string;
    };
    if (!data.download) {
      throw new Error(`Real-Debrid returned no download link: ${data.error || 'unknown error'}`);
    }
    return { download: data.download, filename: data.filename, filesize: data.filesize };
  }

  private static async unrestrictAllDebrid(
    apiKey: string,
    url: string
  ): Promise<{ download: string; filename?: string; filesize?: number }> {
    const qs = new URLSearchParams({
      agent: 'g1dm',
      apikey: apiKey,
      link: url,
    });
    const res = await fetch(`https://api.alldebrid.com/v4/link/unlock?${qs.toString()}`);

    if (!res.ok) {
      throw new Error(`AllDebrid unlock failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as {
      status?: string;
      data?: { link?: string; filename?: string; filesize?: number };
      error?: { message?: string };
    };
    if (data.status !== 'success' || !data.data?.link) {
      throw new Error(`AllDebrid returned no download link: ${data.error?.message || 'unknown error'}`);
    }
    return {
      download: data.data.link,
      filename: data.data.filename,
      filesize: data.data.filesize,
    };
  }

  private static async unrestrictPremiumize(
    apiKey: string,
    url: string
  ): Promise<{ download: string; filename?: string; filesize?: number }> {
    const qs = new URLSearchParams({ apikey: apiKey, src: url });
    const res = await fetch(`https://www.premiumize.me/api/transfer/directlink?${qs.toString()}`, {
      method: 'POST',
    });

    if (!res.ok) {
      throw new Error(`Premiumize directlink failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as {
      status?: string;
      location?: string;
      filename?: string;
      filesize?: number;
      message?: string;
    };
    if (data.status !== 'success' || !data.location) {
      throw new Error(`Premiumize returned no download link: ${data.message || 'unknown error'}`);
    }
    return { download: data.location, filename: data.filename, filesize: data.filesize };
  }
}
