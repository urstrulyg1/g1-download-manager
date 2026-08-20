import { PlatformCapabilities, PlatformCapabilityReport } from './PlatformCapabilities';
import { PlatformPaths } from './PlatformPaths';
import { PlatformPower, BatteryState } from './PlatformPower';
import { PlatformNotifications, NativeNotificationOptions } from './PlatformNotifications';

export class PlatformService {
  public static getCapabilities(): PlatformCapabilityReport {
    return PlatformCapabilities.getReport();
  }

  public static getPaths() {
    return PlatformPaths;
  }

  public static async getBatteryState(): Promise<BatteryState> {
    return PlatformPower.getBatteryState();
  }

  public static async notify(options: NativeNotificationOptions): Promise<boolean> {
    return PlatformNotifications.showNotification(options);
  }
}
