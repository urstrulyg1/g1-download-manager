export interface DomainPolicyStats {
  domain: string;
  maxEffectiveConnections: number;
  currentAllowedConnections: number;
  rangeSupport: boolean;
  httpVersion: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
  avgRttMs: number;
  avgThroughputBytesPerSec: number;
  consecutiveFailures: number;
  throttlingCount: number;
  lastThrottledAt?: number;
  lastSuccessAt?: number;
  cooldownUntil?: number;
}

export class ServerPolicyEngine {
  private domainPolicies: Map<string, DomainPolicyStats> = new Map();
  private readonly defaultMaxConnections = 16;
  private readonly minConnections = 1;

  public getDomainFromUrl(targetUrl: string): string {
    try {
      const parsed = new URL(targetUrl);
      return parsed.hostname.toLowerCase();
    } catch {
      return 'default';
    }
  }

  public getPolicy(domainOrUrl: string): DomainPolicyStats {
    const domain = domainOrUrl.includes('://') ? this.getDomainFromUrl(domainOrUrl) : domainOrUrl.toLowerCase();
    let policy = this.domainPolicies.get(domain);

    if (!policy) {
      policy = {
        domain,
        maxEffectiveConnections: this.defaultMaxConnections,
        currentAllowedConnections: 8,
        rangeSupport: true,
        httpVersion: 'HTTP/1.1',
        avgRttMs: 50,
        avgThroughputBytesPerSec: 0,
        consecutiveFailures: 0,
        throttlingCount: 0,
      };
      this.domainPolicies.set(domain, policy);
    }

    return policy;
  }

  public getRecommendedConnections(domainOrUrl: string, userMaxConnections: number = 8): number {
    const policy = this.getPolicy(domainOrUrl);

    // If domain is currently in cooldown (e.g. after receiving 429/503)
    if (policy.cooldownUntil && Date.now() < policy.cooldownUntil) {
      return 1; // Strict fallback during cooldown
    }

    return Math.max(
      this.minConnections,
      Math.min(userMaxConnections, policy.currentAllowedConnections, policy.maxEffectiveConnections)
    );
  }

  public recordSuccess(domainOrUrl: string, rttMs: number, throughputBytesPerSec: number, bytesDownloaded: number): void {
    const policy = this.getPolicy(domainOrUrl);
    policy.consecutiveFailures = 0;
    policy.lastSuccessAt = Date.now();

    // Exponential Moving Average (EMA) for RTT and Throughput
    policy.avgRttMs = Math.round(policy.avgRttMs * 0.8 + rttMs * 0.2);
    policy.avgThroughputBytesPerSec = Math.round(policy.avgThroughputBytesPerSec * 0.7 + throughputBytesPerSec * 0.3);

    // Additive Increase: If stable and not recently throttled, slowly restore connections
    if (policy.currentAllowedConnections < policy.maxEffectiveConnections) {
      if (!policy.lastThrottledAt || Date.now() - policy.lastThrottledAt > 15000) {
        policy.currentAllowedConnections = Math.min(
          policy.maxEffectiveConnections,
          policy.currentAllowedConnections + 1
        );
      }
    }
  }

  public recordThrottling(domainOrUrl: string, statusCode: number = 429): { newLimit: number; backoffMs: number } {
    const policy = this.getPolicy(domainOrUrl);
    policy.throttlingCount++;
    policy.lastThrottledAt = Date.now();

    // Multiplicative Decrease (AIMD): Halve allowed connections
    policy.currentAllowedConnections = Math.max(
      this.minConnections,
      Math.floor(policy.currentAllowedConnections / 2)
    );

    // Exponential backoff cooldown: 2s, 4s, 8s, up to 30s
    const backoffMs = Math.min(30000, Math.pow(2, Math.min(policy.throttlingCount, 5)) * 1000);
    policy.cooldownUntil = Date.now() + backoffMs;

    return {
      newLimit: policy.currentAllowedConnections,
      backoffMs,
    };
  }

  public recordFailure(domainOrUrl: string, error: string): void {
    const policy = this.getPolicy(domainOrUrl);
    policy.consecutiveFailures++;
    if (policy.consecutiveFailures >= 3) {
      policy.currentAllowedConnections = Math.max(this.minConnections, Math.floor(policy.currentAllowedConnections / 2));
    }
  }

  public setHttpVersion(domainOrUrl: string, version: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3'): void {
    const policy = this.getPolicy(domainOrUrl);
    policy.httpVersion = version;
  }

  public getAllPolicies(): DomainPolicyStats[] {
    return Array.from(this.domainPolicies.values());
  }
}
