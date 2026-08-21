import { MaliciousLinkScanner } from '../src/main/security/MaliciousLinkScanner';
import { ProbeResult } from '../src/main/engine/ProbeService';

describe('Malicious Link Scanner Suite', () => {
  it('should flag raw IP download URLs with suspicious ports', () => {
    const res = MaliciousLinkScanner.scanUrl('http://192.168.1.100:8888/payload.bin');
    expect(res.isSafe).toBe(false);
    expect(res.riskScore).toBeGreaterThanOrEqual(40);
    expect(res.reasons.some((r) => r.includes('Direct IP download'))).toBe(true);
  });

  it('should flag high-risk malware TLDs', () => {
    const res = MaliciousLinkScanner.scanUrl('https://free-installer.top/setup.exe');
    expect(res.isSafe).toBe(false);
    expect(res.reasons.some((r) => r.includes('High-risk domain extension'))).toBe(true);
  });

  it('should flag dynamic tunnel endpoint domains', () => {
    const res = MaliciousLinkScanner.scanUrl('https://ephemeral.ngrok.io/trojan.scr');
    expect(res.isSafe).toBe(false);
    expect(res.reasons.some((r) => r.includes('Dynamic tunnel endpoint'))).toBe(true);
  });

  it('should flag double extension disguised executable payloads', () => {
    const res = MaliciousLinkScanner.scanUrl('https://example.com/downloads/invoice.pdf.exe');
    expect(res.isSafe).toBe(false);
    expect(res.threatType).toBe('DISGUISED_EXECUTABLE');
    expect(res.requireUserOverride).toBe(true);
  });

  it('should flag brand typosquatting phishing URLs', () => {
    const res = MaliciousLinkScanner.scanUrl('https://paypal-auth-verify.top/login');
    expect(res.isSafe).toBe(false);
    expect(res.threatType).toBe('PHISHING_URL');
  });

  it('should detect MIME spoofing from pre-flight probe headers', () => {
    const dummyProbe: ProbeResult = {
      filename: 'document.pdf',
      suggestedCategory: 'document',
      mimeType: 'application/x-msdownload',
      size: 1048576,
      capabilities: {
        supportsRange: true,
        redirectChain: ['https://example.com/document.pdf'],
        protocol: 'https',
        authRequired: false,
        probedAt: Date.now(),
      },
    };

    const res = MaliciousLinkScanner.scanUrl('https://example.com/document.pdf', dummyProbe);
    expect(res.isSafe).toBe(false);
    expect(res.threatType).toBe('MIME_SPOOFING');
  });

  it('should confirm safe HTTPS download URLs', () => {
    const res = MaliciousLinkScanner.scanUrl('https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso');
    expect(res.isSafe).toBe(true);
    expect(res.riskLevel).toBe('SAFE');
    expect(res.requireUserOverride).toBe(false);
  });
});
