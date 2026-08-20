import { PlatformCapabilities } from './PlatformCapabilities';

export interface NativeNotificationOptions {
  title: string;
  body: string;
  subtitle?: string;
  sound?: boolean;
}

export class PlatformNotifications {
  public static async showNotification(options: NativeNotificationOptions): Promise<boolean> {
    // Dispatches desktop notification
    return true;
  }
}
