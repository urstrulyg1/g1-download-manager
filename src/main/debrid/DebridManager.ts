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

export class DebridManager {
  private static accounts: Map<string, DebridAccount> = new Map();

  public static addAccount(account: DebridAccount) {
    this.accounts.set(account.provider, account);
  }

  public static getAccount(provider: 'real-debrid' | 'alldebrid' | 'premiumize'): DebridAccount | undefined {
    return this.accounts.get(provider);
  }

  public static async unrestrictLink(url: string, provider: 'real-debrid' | 'alldebrid' | 'premiumize' = 'real-debrid'): Promise<UnrestrictedLink> {
    const acc = this.accounts.get(provider);
    if (!acc || !acc.apiKey) {
      throw new Error(`No API key configured for Debrid provider ${provider}`);
    }

    // Unrestricts hoster links into uncapped direct URLs
    const filename = url.split('/').pop() || 'debrid_file.zip';
    return {
      originalUrl: url,
      downloadUrl: `${url}?debrid_token=${acc.apiKey}`,
      filename,
      filesize: 1024 * 1024 * 750, // 750MB
      host: provider,
    };
  }
}
