import * as https from 'https';
import * as dgram from 'dgram';
import { TlsPolicy } from '../security/TlsPolicy';

export interface QuicCapabilityResult {
  host: string;
  port: number;
  http3Advertised: boolean;
  altSvcHeader?: string;
  quicUdpReachable: boolean;
  rttMs: number;
  protocol: 'HTTP/3' | 'HTTP/2' | 'HTTP/1.1';
  details: string;
}

export class QuicDiagnostics {
  public static async probeHttp3(targetUrl: string, timeoutMs: number = 5000): Promise<QuicCapabilityResult> {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : 443;

    let http3Advertised = false;
    let altSvcHeader: string | undefined;
    let rttMs = 50;

    const startTime = Date.now();

    // 1. Check Alt-Svc header over HTTPS
    try {
      const altSvc = await new Promise<string | undefined>((resolve) => {
        const req = https.request(
          targetUrl,
          {
            method: 'HEAD',
            timeout: timeoutMs,
            rejectUnauthorized: TlsPolicy.rejectUnauthorized(),
          },
          (res) => {
            const h = res.headers['alt-svc'];
            res.destroy();
            resolve(Array.isArray(h) ? h.join(', ') : h);
          }
        );
        req.on('error', () => resolve(undefined));
        req.on('timeout', () => {
          req.destroy();
          resolve(undefined);
        });
        req.end();
      });

      rttMs = Math.max(1, Date.now() - startTime);
      if (altSvc) {
        altSvcHeader = altSvc;
        if (altSvc.includes('h3') || altSvc.includes('quic')) {
          http3Advertised = true;
        }
      }
    } catch {}

    // 2. Test UDP 443 Reachability
    const quicUdpReachable = await this.testUdpReachable(host, port, 2000);

    const protocol: 'HTTP/3' | 'HTTP/2' | 'HTTP/1.1' =
      http3Advertised && quicUdpReachable ? 'HTTP/3' : 'HTTP/2';

    return {
      host,
      port,
      http3Advertised,
      altSvcHeader,
      quicUdpReachable,
      rttMs,
      protocol,
      details: http3Advertised
        ? `Server advertises HTTP/3 via Alt-Svc (${altSvcHeader}) with ${rttMs}ms RTT.`
        : 'HTTP/3 not advertised in Alt-Svc header. Standard HTTP/2 over TLS active.',
    };
  }

  private static async testUdpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timer = setTimeout(() => {
        try { socket.close(); } catch {}
        resolve(false);
      }, timeoutMs);

      socket.on('error', () => {
        clearTimeout(timer);
        try { socket.close(); } catch {}
        resolve(false);
      });

      // Send a lightweight 1-byte probe packet
      socket.send(Buffer.from([0x00]), port, host, (err) => {
        clearTimeout(timer);
        try { socket.close(); } catch {}
        resolve(!err);
      });
    });
  }
}
