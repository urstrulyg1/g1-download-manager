import { AutopilotControlCenter } from '../src/main/intelligence/AutopilotControlCenter';
import { NetworkPathDiagnostics } from '../src/main/network/NetworkPathDiagnostics';

describe('Autopilot Control Center & Network Path Diagnostics Suite', () => {
  describe('AutopilotControlCenter', () => {
    it('should support switching modes and remembering manual user overrides', () => {
      const center = new AutopilotControlCenter();
      center.setMode('CONSERVATIVE');
      expect(center.getMode()).toBe('CONSERVATIVE');

      center.recordUserOverride('dl_101', 'WORKERS', 4);
      expect(center.hasUserOverride('dl_101', 'WORKERS')).toBe(true);
      expect(center.hasUserOverride('dl_101', 'SPEED_LIMIT')).toBe(false);
    });
  });

  describe('NetworkPathDiagnostics', () => {
    it('should measure time-to-first-byte and path latencies without throwing exceptions', async () => {
      const pathDiag = await NetworkPathDiagnostics.analyzePath('http://example.com', 4000);
      expect(pathDiag.targetUrl).toBe('http://example.com');
      expect(typeof pathDiag.dnsLookupMs).toBe('number');
      expect(typeof pathDiag.totalRoundTripMs).toBe('number');
      expect(pathDiag.bottleneckStage).toBeDefined();
    });
  });
});
