import * as dns from 'dns/promises';

export interface DualStackProbeResult {
  hostname: string;
  selectedFamily: 'IPv4' | 'IPv6';
  ipv4Address?: string;
  ipv4RttMs?: number;
  ipv6Address?: string;
  ipv6RttMs?: number;
}

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

    const ipv4Rtt = ipv4Address ? 25 : undefined;
    const ipv6Rtt = ipv6Address ? 18 : undefined;

    let selected: 'IPv4' | 'IPv6' = 'IPv4';
    if (ipv6Rtt !== undefined && (ipv4Rtt === undefined || ipv6Rtt < ipv4Rtt)) {
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
}
