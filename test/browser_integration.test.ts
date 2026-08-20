import { BrowserIntegrationManager } from '../src/main/browser/BrowserIntegrationManager';
import { InterceptionRulesEngine } from '../src/main/browser/InterceptionRulesEngine';

describe('Browser Integration & Interception Rules', () => {
  it('should inspect health and diagnostic status of installed browsers', async () => {
    const health = await BrowserIntegrationManager.getHealthStatus();
    expect(health.length).toBe(6); // Chrome, Edge, Firefox, Brave, Chromium, Safari
    expect(health.some((h) => h.browser === 'Chrome')).toBe(true);
    expect(health.some((h) => h.browser === 'Firefox')).toBe(true);
  });

  it('should evaluate interception rules with clear explanations', () => {
    const engine = new InterceptionRulesEngine();

    const zipResult = engine.evaluate('https://example.com/download/archive.zip', 'archive.zip');
    expect(zipResult.shouldIntercept).toBe(true);
    expect(zipResult.reason).toContain('*.zip -> G1DM');

    const imgResult = engine.evaluate('https://example.com/images/avatar.jpg', 'avatar.jpg');
    expect(imgResult.shouldIntercept).toBe(false);
    expect(imgResult.reason).toContain('Browser');
  });

  it('should support dynamic rule updates', () => {
    const engine = new InterceptionRulesEngine();
    engine.setRules([
      {
        id: 'rule_custom_iso',
        name: 'Linux ISOs',
        enabled: true,
        type: 'extension',
        pattern: 'iso',
        action: 'INTERCEPT',
      },
    ]);

    const isoResult = engine.evaluate('https://releases.ubuntu.com/ubuntu.iso', 'ubuntu.iso');
    expect(isoResult.shouldIntercept).toBe(true);
  });
});
