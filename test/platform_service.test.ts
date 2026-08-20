import { PlatformService } from '../src/main/platform/PlatformService';
import { PlatformCapabilities } from '../src/main/platform/PlatformCapabilities';
import { PlatformPaths } from '../src/main/platform/PlatformPaths';

describe('Cross-Platform Abstraction & Capability Suite', () => {
  it('should detect operating system and architecture without scattered process.platform checks', () => {
    const report = PlatformService.getCapabilities();

    expect(report.os).toBeDefined();
    expect(report.arch).toBeDefined();
    expect(typeof report.features.atomicRename).toBe('boolean');
    expect(typeof report.features.sparseFiles).toBe('boolean');
  });

  it('should resolve standard platform-specific directories correctly', () => {
    const downloads = PlatformPaths.getDefaultDownloadsDir();
    const appData = PlatformPaths.getAppDataDir();
    const tempDir = PlatformPaths.getTempDir();

    expect(downloads).toBeDefined();
    expect(downloads).toContain('Downloads');
    expect(appData).toBeDefined();
    expect(tempDir).toBeDefined();
  });

  it('should query battery and power state cleanly', async () => {
    const battery = await PlatformService.getBatteryState();
    expect(typeof battery.hasBattery).toBe('boolean');
    expect(battery.batteryPercentage).toBeGreaterThanOrEqual(0);
    expect(typeof battery.isCharging).toBe('boolean');
  });
});
