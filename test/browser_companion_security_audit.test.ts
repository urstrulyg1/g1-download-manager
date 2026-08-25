import { UrlGuard } from '../src/main/security/UrlGuard';
import { InterceptionRulesEngine } from '../src/main/browser/InterceptionRulesEngine';

describe('Browser Companion Security Audit & Input Hardening', () => {
  test('UrlGuard rejects SSRF, loopback, link-local, and malicious URLs from companion', async () => {
    // Localhost / Loopback
    await expect(UrlGuard.assertSafePublicUrl('http://127.0.0.1/admin', { skipDnsResolution: true })).rejects.toThrow(
      'not allowed'
    );
    await expect(UrlGuard.assertSafePublicUrl('http://localhost:8080', { skipDnsResolution: true })).rejects.toThrow(
      'not allowed'
    );

    // Cloud Metadata (169.254.169.254)
    await expect(
      UrlGuard.assertSafePublicUrl('http://169.254.169.254/latest/meta-data/', { skipDnsResolution: true })
    ).rejects.toThrow('not allowed');

    // Private RFC 1918 subnets
    await expect(UrlGuard.assertSafePublicUrl('http://192.168.1.1', { skipDnsResolution: true })).rejects.toThrow(
      'not allowed'
    );
    await expect(UrlGuard.assertSafePublicUrl('http://10.0.0.5:9000', { skipDnsResolution: true })).rejects.toThrow(
      'not allowed'
    );

    // Non-HTTP/HTTPS protocols
    await expect(UrlGuard.assertSafePublicUrl('javascript:alert(1)', { skipDnsResolution: true })).rejects.toThrow(
      'Unsupported protocol'
    );
    await expect(UrlGuard.assertSafePublicUrl('file:///etc/passwd', { skipDnsResolution: true })).rejects.toThrow(
      'Unsupported protocol'
    );

    // Valid public URL
    const valid = await UrlGuard.assertSafePublicUrl('https://releases.ubuntu.com/22.04/ubuntu-22.04.iso', {
      skipDnsResolution: true,
    });
    expect(valid.hostname).toBe('releases.ubuntu.com');
  });

  test('InterceptionRulesEngine evaluates file extensions and patterns accurately', () => {
    const engine = new InterceptionRulesEngine();

    // Archive should intercept
    const zipDecision = engine.evaluate('https://example.com/archive.zip', 'archive.zip');
    expect(zipDecision.shouldIntercept).toBe(true);
    expect(zipDecision.matchedRule?.id).toBe('rule_archives');

    // Executable should intercept
    const exeDecision = engine.evaluate('https://example.com/installer.exe', 'installer.exe');
    expect(exeDecision.shouldIntercept).toBe(true);
    expect(exeDecision.matchedRule?.id).toBe('rule_programs');

    // Small image should let browser handle
    const imgDecision = engine.evaluate('https://example.com/photo.jpg', 'photo.jpg');
    expect(imgDecision.shouldIntercept).toBe(false);
  });
});
