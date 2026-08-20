import { QuicDiagnostics } from '../src/main/engine/QuicDiagnostics';
import { HttpProtocolSelector } from '../src/main/engine/HttpProtocolSelector';
import * as https from 'https';

describe('HTTP/3 & QUIC Transport Capability Layer', () => {
  it('should probe HTTP/3 and detect Alt-Svc headers', async () => {
    const res = await QuicDiagnostics.probeHttp3('https://1.1.1.1', 4000);
    expect(res.host).toBe('1.1.1.1');
    expect(typeof res.http3Advertised).toBe('boolean');
    expect(typeof res.quicUdpReachable).toBe('boolean');
    expect(typeof res.rttMs).toBe('number');
  });

  it('should intelligently select protocol and transport', async () => {
    const decision = await HttpProtocolSelector.selectOptimalProtocol('http://example.com');
    expect(decision.selectedProtocol).toBe('HTTP/1.1');
    expect(decision.transport).toBe('TCP');
  });
});
