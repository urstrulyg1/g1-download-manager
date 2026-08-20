export interface DomainKnowledge {
  domain: string;
  samplesCount: number;
  http1AvgSpeed: number;
  http2AvgSpeed: number;
  http3AvgSpeed: number;
  optimalWorkers: number;
  typicalRttMs: number;
  throttlingThresholdWorkers: number;
  resumeReliabilityPct: number;
  lastObservedAt: number;
}

export interface ConfidenceAwareRecommendation {
  domain: string;
  recommendedWorkers: number;
  recommendedProtocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceCount: number;
  lastObservedAgeMinutes: number;
  reason: string;
}

export class KnowledgeEngine {
  private domainKnowledge: Map<string, DomainKnowledge> = new Map();

  public recordObservation(params: {
    domain: string;
    protocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
    workers: number;
    throughputBytesPerSec: number;
    rttMs: number;
    resumedSuccessfully: boolean;
    throttled: boolean;
  }): void {
    const d = params.domain.toLowerCase();
    let k = this.domainKnowledge.get(d);

    if (!k) {
      k = {
        domain: d,
        samplesCount: 0,
        http1AvgSpeed: 0,
        http2AvgSpeed: 0,
        http3AvgSpeed: 0,
        optimalWorkers: params.workers,
        typicalRttMs: params.rttMs,
        throttlingThresholdWorkers: params.throttled ? params.workers : 16,
        resumeReliabilityPct: params.resumedSuccessfully ? 100 : 80,
        lastObservedAt: Date.now(),
      };
      this.domainKnowledge.set(d, k);
    }

    k.samplesCount++;
    k.lastObservedAt = Date.now();
    k.typicalRttMs = Math.round(k.typicalRttMs * 0.7 + params.rttMs * 0.3);

    if (params.protocol === 'HTTP/3') {
      k.http3AvgSpeed = Math.round(k.http3AvgSpeed * 0.7 + params.throughputBytesPerSec * 0.3);
    } else if (params.protocol === 'HTTP/2') {
      k.http2AvgSpeed = Math.round(k.http2AvgSpeed * 0.7 + params.throughputBytesPerSec * 0.3);
    } else {
      k.http1AvgSpeed = Math.round(k.http1AvgSpeed * 0.7 + params.throughputBytesPerSec * 0.3);
    }

    if (params.throttled) {
      k.throttlingThresholdWorkers = Math.min(k.throttlingThresholdWorkers, params.workers);
      k.optimalWorkers = Math.max(2, Math.floor(params.workers / 2));
    } else {
      k.optimalWorkers = Math.max(k.optimalWorkers, params.workers);
    }
  }

  public getRecommendation(domain: string): ConfidenceAwareRecommendation {
    const k = this.domainKnowledge.get(domain.toLowerCase());

    if (!k || k.samplesCount < 1) {
      return {
        domain,
        recommendedWorkers: 8,
        recommendedProtocol: 'HTTP/2',
        confidence: 'LOW',
        evidenceCount: 0,
        lastObservedAgeMinutes: 0,
        reason: 'Default configuration (insufficient historical observations for domain).',
      };
    }

    const confidence: 'LOW' | 'MEDIUM' | 'HIGH' =
      k.samplesCount >= 10 ? 'HIGH' : k.samplesCount >= 4 ? 'MEDIUM' : 'LOW';

    let bestProtocol: 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3' = 'HTTP/2';
    if (k.http3AvgSpeed > k.http2AvgSpeed * 1.05 && k.http3AvgSpeed > 0) {
      bestProtocol = 'HTTP/3';
    } else if (k.http1AvgSpeed > k.http2AvgSpeed * 1.1) {
      bestProtocol = 'HTTP/1.1';
    }

    const ageMin = Math.round((Date.now() - k.lastObservedAt) / 60000);
    const workers = Math.min(k.optimalWorkers, k.throttlingThresholdWorkers > 0 ? k.throttlingThresholdWorkers : 8);

    return {
      domain,
      recommendedWorkers: Math.max(2, Math.min(workers, 16)),
      recommendedProtocol: bestProtocol,
      confidence,
      evidenceCount: k.samplesCount,
      lastObservedAgeMinutes: ageMin,
      reason: `Historical observation (${k.samplesCount} downloads): ${bestProtocol} achieved peak throughput with ${workers} sockets (RTT: ${k.typicalRttMs}ms).`,
    };
  }

  public clearKnowledge(domain?: string): void {
    if (domain) {
      this.domainKnowledge.delete(domain.toLowerCase());
    } else {
      this.domainKnowledge.clear();
    }
  }
}
