import * as dns from 'dns/promises';
import * as net from 'net';

export interface DualStackProbeResult {
  hostname: string;
  selectedFamily: 'IPv4' | 'IPv6';
  ipv4Address?: string;
  ipv4RttMs?: number;
  ipv6Address?: string;
  ipv6RttMs?: number;
}

const PROBE_PORT = 443;
const PROBE_TIMEOUT_MS = 800;

/**
 * Dual-stack (IPv4/IPv6) selection with real TCP-handshake timing.
 *
 * Resolves both address families and measures actual TCP connect RTT to each
 * (an ECONNREFUSED still yields a useful low-latency signal since the host is
 * reachable). Falls back to "prefer IPv6, then IPv4" when a family cannot be
 * resolved or reached.
 */
export class DualStackSelector {
  public static async selectOptimalFamily(hostname: string): Promise<DualStackProbeResult> {
    let ipv4Address: string | undefined;
    let ipv6Address: string | undefined;

    try {
      const ipv4s = await dns.resolve4(hostname);
      if (ipv4s.length > 0) ipv4Address = ipv4s[0];
    } catch {
      // IPv4 lookup failed
    }

    try {
      const ipv6s = await dns.resolve6(hostname);
      if (ipv6s.length > 0) ipv6Address = ipv6s[0];
    } catch {
      // IPv6 lookup failed
    }

    const [ipv4Rtt, ipv6Rtt] = await Promise.all([
      ipv4Address ? this.measureTcpRtt(ipv4Address) : Promise.resolve(undefined),
      ipv6Address ? this.measureTcpRtt(ipv6Address) : Promise.resolve(undefined),
    ]);

    let selected: 'IPv4' | 'IPv6' = 'IPv4';
    if (ipv6Rtt !== undefined && (ipv4Rtt === undefined || ipv6Rtt <= ipv4Rtt)) {
      selected = 'IPv6';
    }

    return {
      hostname,
      selectedFamily: selected,
      ipv4Address,
      ipv4RttMs: ipv4Rtt,
      ipv6Address,
      ipv6RttMs: ipv6Rtt,
    };
  }

  private static measureTcpRtt(address: string): Promise<number | undefined> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = net.connect({ host: address, port: PROBE_PORT });

      const done = (value: number | undefined) => {
        socket.destroy();
        resolve(value);
      };

      socket.setTimeout(PROBE_TIMEOUT_MS);
      socket.once('connect', () => done(Date.now() - start));
      socket.once('timeout', () => done(undefined));
      // ECONNREFUSED / ENETUNREACH still tells us the host is reachable fast.
      socket.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED') {
          done(Date.now() - start);
        } else {
          done(undefined);
        }
      });
    });
  }
}
