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
  private rules: InterceptionRule[] = [
    {
      id: 'rule_archives',
      name: 'Compressed Archives',
      enabled: true,
      type: 'extension',
      pattern: 'zip,rar,7z,tar,gz,bz2,xz,iso,dmg,tgz',
      action: 'INTERCEPT',
      description: 'Send all compressed archive downloads to G1DM',
    },
    {
      id: 'rule_programs',
      name: 'Executables & Installers',
      enabled: true,
      type: 'extension',
      pattern: 'exe,msi,deb,rpm,apk,appimage,pkg,bin',
      action: 'INTERCEPT',
      description: 'Send installer files to G1DM',
    },
    {
      id: 'rule_videos',
      name: 'Video Files',
      enabled: true,
      type: 'extension',
      pattern: 'mp4,mkv,avi,mov,wmv,webm,flv,m4v',
      action: 'INTERCEPT',
      description: 'Send large video files to G1DM',
    },
    {
      id: 'rule_docs',
      name: 'Documents',
      enabled: true,
      type: 'extension',
      pattern: 'pdf,doc,docx,xls,xlsx,ppt,pptx,epub',
      action: 'INTERCEPT',
      description: 'Send documents to G1DM',
    },
    {
      id: 'rule_small_images',
      name: 'Web Images',
      enabled: true,
      type: 'extension',
      pattern: 'jpg,jpeg,png,gif,webp,svg,ico',
      action: 'BROWSER_DEFAULT',
      description: 'Let browser handle normal image view/save',
    },
  ];

  public evaluate(url: string, filename?: string, mimeType?: string, byteSize?: number): InterceptionDecision {
    const ext = filename ? filename.split('.').pop()?.toLowerCase() : url.split('?')[0].split('.').pop()?.toLowerCase();
    const domain = new URL(url).hostname.toLowerCase();

    // Check extension rules
    if (ext) {
      for (const rule of this.rules) {
        if (!rule.enabled || rule.type !== 'extension') continue;
        const exts = rule.pattern.split(',').map((s) => s.trim().toLowerCase());
        if (exts.includes(ext)) {
          return {
            shouldIntercept: rule.action === 'INTERCEPT',
            matchedRule: rule,
            reason:
              rule.action === 'INTERCEPT'
                ? `Matched rule "${rule.name}" (*.${ext} -> G1DM)`
                : `Matched browser rule "${rule.name}" (*.${ext} -> Browser)`,
          };
        }
      }
    }

    // Default fallback
    return {
      shouldIntercept: true,
      reason: 'No conflicting exclusion rules matched. Intercepted by G1DM.',
    };
  }

  public getRules(): InterceptionRule[] {
    return [...this.rules];
  }

  public setRules(rules: InterceptionRule[]): void {
    this.rules = rules;
  }
}
