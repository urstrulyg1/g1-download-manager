import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { PlatformCapabilities } from './PlatformCapabilities';

export interface BatteryState {
  hasBattery: boolean;
  isCharging: boolean;
  batteryPercentage: number;
  isLowPowerMode: boolean;
}

export class PlatformPower {
  public static async getBatteryState(): Promise<BatteryState> {
    const platform = PlatformCapabilities.getPlatform();

    if (platform === 'linux') {
      try {
        const base = '/sys/class/power_supply';
        if (fs.existsSync(base)) {
          const entries = fs.readdirSync(base);
          const bat = entries.find((e) => e.startsWith('BAT'));
          if (bat) {
            const capPath = path.join(base, bat, 'capacity');
            const statusPath = path.join(base, bat, 'status');
            const capacity = fs.existsSync(capPath) ? parseInt(fs.readFileSync(capPath, 'utf8').trim(), 10) : 100;
            const status = fs.existsSync(statusPath) ? fs.readFileSync(statusPath, 'utf8').trim() : 'Charging';
            return {
              hasBattery: true,
              isCharging: status === 'Charging' || status === 'Full',
              batteryPercentage: isNaN(capacity) ? 100 : capacity,
              isLowPowerMode: capacity < 20,
            };
          }
        }
      } catch {}
      return {
        hasBattery: false,
        isCharging: true,
        batteryPercentage: 100,
        isLowPowerMode: false,
      };
    }

    if (platform === 'macos') {
      return new Promise<BatteryState>((resolve) => {
        exec('pmset -g batt', (err, stdout) => {
          if (err || !stdout) {
            resolve({ hasBattery: false, isCharging: true, batteryPercentage: 100, isLowPowerMode: false });
            return;
          }
          const match = stdout.match(/(\d+)%/);
          const pct = match ? parseInt(match[1], 10) : 100;
          const isCharging = stdout.includes('charging') || stdout.includes('AC Power');
          resolve({
            hasBattery: stdout.includes('InternalBattery'),
            isCharging,
            batteryPercentage: pct,
            isLowPowerMode: pct < 20,
          });
        });
      });
    }

    return {
      hasBattery: false,
      isCharging: true,
      batteryPercentage: 100,
      isLowPowerMode: false,
    };
  }
}
