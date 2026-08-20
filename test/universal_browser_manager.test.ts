import { BrowserManager } from '../src/main/browser/BrowserManager';

describe('Universal Browser Manager & Native Messaging Suite', () => {
  it('should enumerate all supported browsers and native host paths', () => {
    const browsers = BrowserManager.detectAllBrowsers();

    expect(browsers.length).toBe(6); // Chrome, Edge, Firefox, Brave, Chromium, Safari
    expect(browsers.some((b) => b.id === 'chrome')).toBe(true);
    expect(browsers.some((b) => b.id === 'firefox')).toBe(true);
    expect(browsers.some((b) => b.id === 'brave')).toBe(true);
  });

  it('should execute end-to-end round trip test communication', async () => {
    const testRes = await BrowserManager.testBrowserRoundTrip('chrome');
    expect(testRes.success).toBe(true);
    expect(testRes.rttMs).toBeGreaterThanOrEqual(0);
    expect(testRes.message).toContain('Native messaging loopback');
  });
});
