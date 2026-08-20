import { TlsInspector } from '../src/main/engine/TlsInspector';

describe('First-Class HTTPS & TLS Inspector Subsystem', () => {
  it('should identify non-HTTPS plain URLs correctly', async () => {
    const res = await TlsInspector.inspectTls('http://example.com/test');
    expect(res.isHttps).toBe(false);
    expect(res.serverName).toBe('example.com');
  });

  it('should inspect TLS parameters on live HTTPS targets safely', async () => {
    const res = await TlsInspector.inspectTls('https://1.1.1.1', 8000);
    expect(res.isHttps).toBe(true);
    expect(res.serverName).toBe('1.1.1.1');
  });
});
