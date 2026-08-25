/**
 * Advisory routing policy for browser companions.
 *
 * There is deliberately no extension/MIME allowlist here: a URL chosen for
 * G1DM is sent to the core for probing and DownloadEngine transfer regardless
 * of its apparent type. Browser companions do not invoke browser downloads.
 */
export interface InterceptionRule {
  id: string;
  name: string;
  enabled: boolean;
  type: 'domain' | 'extension' | 'mime' | 'size' | 'protocol';
  pattern: string;
  action: 'INTERCEPT' | 'BROWSER_DEFAULT';
  description?: string;
}

export interface InterceptionDecision {
  shouldIntercept: boolean;
  matchedRule?: InterceptionRule;
  reason: string;
}

export class InterceptionRulesEngine {
  private rules: InterceptionRule[] = [];

  public evaluate(url: string, _filename?: string, _mimeType?: string, _byteSize?: number): InterceptionDecision {
    // Explicit user exclusions remain supported, but there is intentionally no
    // file-type fallback. Any legitimate HTTP(S) resource selected for G1DM
    // follows the canonical DownloadEngine pipeline.
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();
    for (const rule of this.rules) {
      if (!rule.enabled || rule.action !== 'BROWSER_DEFAULT' || rule.type !== 'domain') continue;
      if (domain === rule.pattern.toLowerCase() || domain.endsWith(`.${rule.pattern.toLowerCase()}`)) {
        return { shouldIntercept: false, matchedRule: rule, reason: `Matched explicit browser exclusion "${rule.name}".` };
      }
    }
    return { shouldIntercept: true, reason: 'Universal G1DM routing: URL will be transferred by DownloadEngine.' };
  }

  public getRules(): InterceptionRule[] { return [...this.rules]; }
  public setRules(rules: InterceptionRule[]): void { this.rules = rules; }
}
