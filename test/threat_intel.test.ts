import { ThreatIntelService } from '../src/main/security/ThreatIntelService';

describe('ThreatIntelService — cloud reputation lookups', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    ThreatIntelService.clearCache();
    jest.restoreAllMocks();
  });

  function mockFetch(handler: (url: string) => any) {
    global.fetch = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      return handler(url);
    }) as any;
  }

  function jsonResponse(body: any, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }

  it('flags URLs listed in URLhaus as malicious with a large risk delta', async () => {
    mockFetch((url) => {
      if (url.includes('urlhaus')) {
        return jsonResponse({ query_status: 'ok', url_status: 'online', threat: 'malware_download' });
      }
      throw new Error('unexpected fetch');
    });

    const verdict = await ThreatIntelService.checkUrl('http://evil.example/payload.exe', { urlHausEnabled: true });
    expect(verdict.overallVerdict).toBe('malicious');
    expect(verdict.riskScoreDelta).toBeGreaterThanOrEqual(70);
    expect(verdict.sources[0].provider).toBe('urlhaus');
    expect(verdict.sources[0].detail).toContain('ONLINE');
  });

  it('returns clean for URLs absent from URLhaus', async () => {
    mockFetch((url) => {
      if (url.includes('urlhaus')) return jsonResponse({ query_status: 'no_results' });
      throw new Error('unexpected fetch');
    });

    const verdict = await ThreatIntelService.checkUrl('https://example.com/file.zip', { urlHausEnabled: true });
    expect(verdict.overallVerdict).toBe('clean');
    expect(verdict.riskScoreDelta).toBe(0);
  });

  it('aggregates VirusTotal analysis stats when an API key is provided', async () => {
    mockFetch((url) => {
      if (url.includes('urlhaus')) return jsonResponse({ query_status: 'no_results' });
      if (url.includes('virustotal')) {
        return jsonResponse({
          data: { attributes: { last_analysis_stats: { malicious: 12, suspicious: 2, harmless: 60, undetected: 5 } } },
        });
      }
      throw new Error('unexpected fetch');
    });

    const verdict = await ThreatIntelService.checkUrl('http://bad.example/x', {
      urlHausEnabled: true,
      virusTotalApiKey: 'k',
    });
    expect(verdict.overallVerdict).toBe('malicious');
    const vt = verdict.sources.find((s) => s.provider === 'virustotal');
    expect(vt?.positives).toBe(12);
  });

  it('treats VT unknown URLs and rejected keys as non-fatal', async () => {
    mockFetch((url) => {
      if (url.includes('urlhaus')) return jsonResponse({ query_status: 'no_results' });
      if (url.includes('virustotal')) return jsonResponse({}, 404);
      throw new Error('unexpected fetch');
    });

    const verdict = await ThreatIntelService.checkUrl('https://new-site.example/f', {
      urlHausEnabled: true,
      virusTotalApiKey: 'k',
    });
    expect(verdict.overallVerdict).toBe('clean'); // URLhaus clean wins over VT unknown
    const vt = verdict.sources.find((s) => s.provider === 'virustotal');
    expect(vt?.verdict).toBe('unknown');
  });

  it('survives total network failure and returns unknown', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });

    const verdict = await ThreatIntelService.checkUrl('https://example.com/a', { urlHausEnabled: true });
    expect(verdict.overallVerdict).toBe('unknown');
    expect(verdict.riskScoreDelta).toBe(0);
    expect(verdict.sources[0].verdict).toBe('error');
  });

  it('caches verdicts to avoid hammering third-party APIs', async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url.includes('urlhaus')) {
        calls++;
        return jsonResponse({ query_status: 'no_results' });
      }
      throw new Error('unexpected fetch');
    });

    await ThreatIntelService.checkUrl('https://cached.example/f', { urlHausEnabled: true });
    await ThreatIntelService.checkUrl('https://cached.example/f', { urlHausEnabled: true });
    expect(calls).toBe(1);
  });
});
