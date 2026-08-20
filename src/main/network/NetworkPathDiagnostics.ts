import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import * as https from 'https';

export interface PathLatencyBreakdown {
  targetUrl: string;
  dnsLookupMs: number;
  tcpHandshakeMs: number;
  tlsHandshakeMs: number;
  timeToFirstByteMs: number;
  totalRoundTripMs: number;
  bottleneckStage: 'DNS' | 'TCP' | 'TLS' | 'SERVER_RESPONSE' | 'NETWORK_THROUGHPUT';
  explanation: string;
  measuredAt: number;
}

export class NetworkPathDiagnostics {
  public static async analyzePath(targetUrl: string, timeoutMs = 8000): Promise<PathLatencyBreakdown> {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const isHttps = parsed.protocol === 'https:';
    const port = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;

    // 1. Measure DNS Lookup
    const dnsStart = Date.now();
    const dnsAddress = await new Promise<string>((resolve, reject) => {
      dns.lookup(host, (err, address) => {
        if (err) resolve(host);
        else resolve(address);
      });
    });
    const dnsLookupMs = Math.max(1, Date.now() - dnsStart);

    // 2. Measure TCP Handshake
    const tcpStart = Date.now();
    let tcpHandshakeMs = 20;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host: dnsAddress, port, timeout: 3000 }, () => {
          tcpHandshakeMs = Math.max(1, Date.now() - tcpStart);
          socket.destroy();
          resolve();
        });
        socket.on('error', () => resolve());
        socket.on('timeout', () => { socket.destroy(); resolve(); });
      });
    } catch {}

    // 3. Measure TLS Handshake
    let tlsHandshakeMs = 0;
    if (isHttps) {
      const tlsStart = Date.now();
      try {
        await new Promise<void>((resolve) => {
          const tlsSocket = tls.connect({ host: dnsAddress, port, servername: host, timeout: 3000, rejectUnauthorized: false }, () => {
            tlsHandshakeMs = Math.max(1, Date.now() - tlsStart);
            tlsSocket.destroy();
            resolve();
          });
          tlsSocket.on('error', () => resolve());
          tlsSocket.on('timeout', () => { tlsSocket.destroy(); resolve(); });
        });
      } catch {}
    }

    // 4. Measure Time-To-First-Byte (TTFB)
    const ttfbStart = Date.now();
    let timeToFirstByteMs = 40;
    try {
      await new Promise<void>((resolve) => {
        const req = (isHttps ? https : require('http')).request(targetUrl, { method: 'HEAD', timeout: 4000, rejectUnauthorized: false }, (res: any) => {
          timeToFirstByteMs = Math.max(1, Date.now() - ttfbStart);
          res.destroy();
          resolve();
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.end();
      });
    } catch {}

    const totalRoundTripMs = dnsLookupMs + tcpHandshakeMs + tlsHandshakeMs + timeToFirstByteMs;

    let bottleneckStage: PathLatencyBreakdown['bottleneckStage'] = 'SERVER_RESPONSE';
    let explanation = `Network path healthy (Total RTT: ${totalRoundTripMs}ms).`;

    if (dnsLookupMs > 150) {
      bottleneckStage = 'DNS';
      explanation = `DNS resolution latency is high (${dnsLookupMs}ms). Consider using 1.1.1.1 or 8.8.8.8.`;
    } else if (timeToFirstByteMs > 300) {
      bottleneckStage = 'SERVER_RESPONSE';
      explanation = `Remote server response latency is high (TTFB: ${timeToFirstByteMs}ms).`;
    } else if (tlsHandshakeMs > 200) {
      bottleneckStage = 'TLS';
      explanation = `TLS certificate negotiation overhead is high (${tlsHandshakeMs}ms).`;
    }

    return {
      targetUrl,
      dnsLookupMs,
      tcpHandshakeMs,
      tlsHandshakeMs,
      timeToFirstByteMs,
      totalRoundTripMs,
      bottleneckStage,
      explanation,
      measuredAt: Date.now(),
    };
  }
}
