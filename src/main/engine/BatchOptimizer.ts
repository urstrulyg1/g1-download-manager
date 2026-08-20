export interface BatchPlanGroup {
  domain: string;
  urls: string[];
  totalEstimatedBytes: number;
  allocatedConcurrency: number;
  scheduledOrder: number;
}

export interface BatchOptimizationPlan {
  totalItems: number;
  uniqueDomainsCount: number;
  domainGroups: BatchPlanGroup[];
  recommendedGlobalConcurrency: number;
}

export class BatchOptimizer {
  public static planBatch(urls: string[], globalMaxConcurrency = 8): BatchOptimizationPlan {
    const domainMap = new Map<string, string[]>();

    for (const u of urls) {
      try {
        const domain = new URL(u).hostname.toLowerCase();
        if (!domainMap.has(domain)) domainMap.set(domain, []);
        domainMap.get(domain)!.push(u);
      } catch {}
    }

    const domainGroups: BatchPlanGroup[] = [];
    let order = 1;

    for (const [domain, domainUrls] of domainMap.entries()) {
      // Allocate max 2-4 connections per individual domain to prevent 429 server throttling
      const domainConcurrency = Math.max(1, Math.min(domainUrls.length, 4));
      domainGroups.push({
        domain,
        urls: domainUrls,
        totalEstimatedBytes: domainUrls.length * 10 * 1024 * 1024,
        allocatedConcurrency: domainConcurrency,
        scheduledOrder: order++,
      });
    }

    return {
      totalItems: urls.length,
      uniqueDomainsCount: domainMap.size,
      domainGroups,
      recommendedGlobalConcurrency: Math.min(globalMaxConcurrency, 12),
    };
  }
}
