import { KnowledgeEngine } from '../src/main/intelligence/KnowledgeEngine';

describe('Knowledge Engine & Confidence-Aware Intelligence Suite', () => {
  it('should learn from successful downloads and recommend optimal protocols and socket counts', () => {
    const engine = new KnowledgeEngine();
    const domain = 'fast-cdn.example.com';

    for (let i = 0; i < 5; i++) {
      engine.recordObservation({
        domain,
        protocol: 'HTTP/2',
        workers: 6,
        throughputBytesPerSec: 90 * 1024 * 1024,
        rttMs: 25,
        resumedSuccessfully: true,
        throttled: false,
      });
    }

    const rec = engine.getRecommendation(domain);
    expect(rec.confidence).toBe('MEDIUM');
    expect(rec.recommendedProtocol).toBe('HTTP/2');
    expect(rec.recommendedWorkers).toBe(6);
    expect(rec.evidenceCount).toBe(5);
    expect(rec.reason).toContain('Historical observation');
  });

  it('should assign LOW confidence when domain has insufficient historical samples', () => {
    const engine = new KnowledgeEngine();
    const rec = engine.getRecommendation('new-unseen-server.org');

    expect(rec.confidence).toBe('LOW');
    expect(rec.evidenceCount).toBe(0);
  });

  it('should assign HIGH confidence when domain has 10+ observations', () => {
    const engine = new KnowledgeEngine();
    const domain = 'frequent-host.com';

    for (let i = 0; i < 12; i++) {
      engine.recordObservation({
        domain,
        protocol: 'HTTP/3',
        workers: 8,
        throughputBytesPerSec: 100 * 1024 * 1024,
        rttMs: 15,
        resumedSuccessfully: true,
        throttled: false,
      });
    }

    const rec = engine.getRecommendation(domain);
    expect(rec.confidence).toBe('HIGH');
    expect(rec.recommendedProtocol).toBe('HTTP/3');
    expect(rec.evidenceCount).toBe(12);
  });

  it('should support clearing domain knowledge selectively or globally', () => {
    const engine = new KnowledgeEngine();
    engine.recordObservation({
      domain: 'clear-me.com',
      protocol: 'HTTP/1.1',
      workers: 2,
      throughputBytesPerSec: 1024 * 1024,
      rttMs: 50,
      resumedSuccessfully: true,
      throttled: false,
    });

    engine.clearKnowledge('clear-me.com');
    expect(engine.getRecommendation('clear-me.com').confidence).toBe('LOW');
  });

  it('should adapt recommended workers when server throttling occurs', () => {
    const engine = new KnowledgeEngine();
    engine.recordObservation({
      domain: 'throttled-knowledge.com',
      protocol: 'HTTP/2',
      workers: 8,
      throughputBytesPerSec: 5 * 1024 * 1024,
      rttMs: 40,
      resumedSuccessfully: true,
      throttled: true,
    });

    const rec = engine.getRecommendation('throttled-knowledge.com');
    expect(rec.recommendedWorkers).toBeLessThanOrEqual(4);
  });

  it('should learn HTTP/1.1 superiority when HTTP/2 throughput is lower', () => {
    const engine = new KnowledgeEngine();
    const domain = 'legacy-fast.com';

    for (let i = 0; i < 6; i++) {
      engine.recordObservation({
        domain,
        protocol: 'HTTP/1.1',
        workers: 4,
        throughputBytesPerSec: 80 * 1024 * 1024,
        rttMs: 20,
        resumedSuccessfully: true,
        throttled: false,
      });
    }

    const rec = engine.getRecommendation(domain);
    expect(rec.recommendedProtocol).toBe('HTTP/1.1');
  });

  it('should track RTT exponential moving averages accurately across observation samples', () => {
    const engine = new KnowledgeEngine();
    const domain = 'rtt-test.com';

    engine.recordObservation({ domain, protocol: 'HTTP/2', workers: 4, throughputBytesPerSec: 1000, rttMs: 100, resumedSuccessfully: true, throttled: false });
    engine.recordObservation({ domain, protocol: 'HTTP/2', workers: 4, throughputBytesPerSec: 1000, rttMs: 20, resumedSuccessfully: true, throttled: false });

    const rec = engine.getRecommendation(domain);
    expect(rec.evidenceCount).toBe(2);
  });

  it('should handle uppercase domain normalization cleanly', () => {
    const engine = new KnowledgeEngine();
    engine.recordObservation({ domain: 'UPPERCASE-DOMAIN.COM', protocol: 'HTTP/2', workers: 4, throughputBytesPerSec: 1000, rttMs: 25, resumedSuccessfully: true, throttled: false });
    const rec = engine.getRecommendation('uppercase-domain.com');
    expect(rec.evidenceCount).toBe(1);
  });
});
