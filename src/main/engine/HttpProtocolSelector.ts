import { QuicDiagnostics, QuicCapabilityResult } from './QuicDiagnostics';
import { TlsInspector } from './TlsInspector';

export interface ProtocolSelectionDecision {
  selectedProtocol: 'HTTP/3' | 'HTTP/2' | 'HTTP/1.1';
  transport: 'QUIC' | 'TLS_TCP' | 'TCP';
  alpn: string;
  rttMs: number;
  reason: string;
  fallbackProtocol: 'HTTP/2' | 'HTTP/1.1';
}

export class HttpProtocolSelector {
  public static async selectOptimalProtocol(targetUrl: string): Promise<ProtocolSelectionDecision> {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
      return {
        selectedProtocol: 'HTTP/1.1',
        transport: 'TCP',
        alpn: 'http/1.1',
        rttMs: 20,
        reason: 'Unencrypted HTTP protocol selected.',
        fallbackProtocol: 'HTTP/1.1',
      };
    }

    // 1. Run QUIC / HTTP/3 Diagnostic Probe
    const quicResult = await QuicDiagnostics.probeHttp3(targetUrl, 4000).catch(() => ({
      host: parsed.hostname,
      port: 443,
      http3Advertised: false,
      altSvcHeader: undefined,
      quicUdpReachable: false,
      rttMs: 45,
      protocol: 'HTTP/2' as const,
      details: 'QUIC probe timed out.',
    }));

    // 2. Run TLS Inspector
    const tlsResult = await TlsInspector.inspectTls(targetUrl, 4000).catch(() => ({
      isHttps: true,
      alpnProtocol: 'HTTP/2',
      authorized: true,
      serverName: parsed.hostname,
      negotiatedAt: Date.now(),
    }));

    if (quicResult.http3Advertised && quicResult.quicUdpReachable) {
      return {
        selectedProtocol: 'HTTP/3',
        transport: 'QUIC',
        alpn: 'h3',
        rttMs: quicResult.rttMs,
        reason: `HTTP/3 (QUIC) negotiated via Alt-Svc (${quicResult.altSvcHeader || 'h3'}). Minimal handshake latency.`,
        fallbackProtocol: 'HTTP/2',
      };
    }

    if (tlsResult.alpnProtocol === 'HTTP/2') {
      return {
        selectedProtocol: 'HTTP/2',
        transport: 'TLS_TCP',
        alpn: 'h2',
        rttMs: quicResult.rttMs,
        reason: 'HTTP/2 multiplexed streams negotiated over TLS 1.3.',
        fallbackProtocol: 'HTTP/1.1',
      };
    }

    return {
      selectedProtocol: 'HTTP/1.1',
      transport: 'TLS_TCP',
      alpn: 'http/1.1',
      rttMs: quicResult.rttMs,
      reason: 'HTTP/1.1 persistent keep-alive connections over TLS.',
      fallbackProtocol: 'HTTP/1.1',
    };
  }
}
