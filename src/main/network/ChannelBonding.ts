import * as os from 'os';

export interface NetworkAdapter {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  isCellularOrWifi: boolean;
  speedMbps: number;
}

export class ChannelBonding {
  public static detectAdapters(): NetworkAdapter[] {
    const ifaces = os.networkInterfaces();
    const adapters: NetworkAdapter[] = [];

    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const a of addrs) {
        if (!a.internal && a.family === 'IPv4') {
          const isMobile = name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('cellular') || name.toLowerCase().includes('usb');
          adapters.push({
            name,
            address: a.address,
            family: 'IPv4',
            isCellularOrWifi: isMobile,
            speedMbps: isMobile ? 150 : 1000,
          });
        }
      }
    }

    return adapters;
  }

  public static getNextInterfaceAddress(connectionIndex: number): string | undefined {
    const adapters = this.detectAdapters();
    if (adapters.length === 0) return undefined;
    return adapters[connectionIndex % adapters.length].address;
  }
}
