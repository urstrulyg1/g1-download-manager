import { UrlGuard, UrlGuardError } from '../src/main/security/UrlGuard';
import { PathGuard } from '../src/main/security/PathGuard';
import { TlsPolicy } from '../src/main/security/TlsPolicy';
import { redactSettings } from '../src/main/security/Redact';
import { RequestAuth } from '../src/main/security/RequestAuth';
import { AppDatabase } from '../src/main/db/Database';

describe('Security Hardening', () => {
  describe('UrlGuard (SSRF)', () => {
    it('blocks loopback, link-local, and private literals', async () => {
      for (const url of [
        'http://127.0.0.1:8055/api',
        'http://localhost/admin',
        'http://169.254.169.254/latest/meta-data',
        'http://10.0.0.5/file',
        'http://192.168.1.1/',
        'http://[::1]/x',
        'ftp://example.com/file',
        'file:///etc/passwd',
      ]) {
        await expect(UrlGuard.assertSafePublicUrl(url)).rejects.toThrow(UrlGuardError);
      }
    });

    it('allows public HTTP(S) URLs', async () => {
      const parsed = await UrlGuard.assertSafePublicUrl('https://example.com/file.zip', {
        skipDnsResolution: true,
      });
      expect(parsed.hostname).toBe('example.com');
    });

    it('rejects a hostname that resolves to a private address', async () => {
      await expect(UrlGuard.assertSafePublicUrl('http://localhost')).rejects.toThrow(UrlGuardError);
    });
  });

  describe('PathGuard (path traversal)', () => {
    it('allows paths inside the permitted roots', () => {
      PathGuard.setAllowedRoots(['/tmp/g1dm-test']);
      expect(PathGuard.assertSafeLocalPath('/tmp/g1dm-test/sub/file.bin')).toBe(
        '/tmp/g1dm-test/sub/file.bin'
      );
    });

    it('rejects paths outside the permitted roots', () => {
      PathGuard.setAllowedRoots(['/tmp/g1dm-test']);
      expect(() => PathGuard.assertSafeLocalPath('/etc/passwd')).toThrow(/outside the permitted/);
      expect(() => PathGuard.assertSafeLocalPath('/tmp/g1dm-test-other/x')).toThrow(
        /outside the permitted/
      );
    });
  });

  describe('TlsPolicy', () => {
    it('verifies certificates by default', () => {
      expect(TlsPolicy.getVerifySslCertificates()).toBe(true);
      expect(TlsPolicy.rejectUnauthorized()).toBe(false);
    });

    it('can be disabled to allow self-signed certificates', () => {
      TlsPolicy.setVerifySslCertificates(false);
      expect(TlsPolicy.rejectUnauthorized()).toBe(true);
      TlsPolicy.setVerifySslCertificates(true);
    });
  });

  describe('redactSettings', () => {
    it('removes all secret fields', () => {
      const db = new AppDatabase(':memory:');
      const settings = db.getSettings();
      settings.network.proxyPassword = 'p@ssw0rd';
      settings.security.virusTotalApiKey = 'vt_key';
      settings.security.apiKey = 'api_key';
      settings.remote.telegramBotToken = 'tg_token';
      settings.remote.discordWebhookUrl = 'https://discord.com/api/webhooks/x';
      settings.automation.archivePasswords = ['secret1', 'secret2'];

      const clean = redactSettings(settings);
      expect(clean.network.proxyPassword).toBe('***REDACTED***');
      expect(clean.security.virusTotalApiKey).toBe('***REDACTED***');
      expect(clean.security.apiKey).toBe('***REDACTED***');
      expect(clean.remote.telegramBotToken).toBe('***REDACTED***');
      expect(clean.remote.discordWebhookUrl).toBe('***REDACTED***');
      expect(clean.automation.archivePasswords).toEqual(['***REDACTED***', '***REDACTED***']);

      // The original object must not be mutated.
      expect(settings.network.proxyPassword).toBe('p@ssw0rd');
    });
  });

  describe('RequestAuth', () => {
    it('rejects an unknown key', () => {
      process.env.G1DM_API_KEY = 'correct-horse-battery-staple';
      RequestAuth.setApiKeyProvider(() => undefined);
      expect(RequestAuth.isValidKey('wrong-key')).toBe(false);
      expect(RequestAuth.isValidKey('correct-horse-battery-staple')).toBe(true);
      delete process.env.G1DM_API_KEY;
    });

    it('uses the configured provider key', () => {
      RequestAuth.setApiKeyProvider(() => 'provider-key');
      expect(RequestAuth.isValidKey('provider-key')).toBe(true);
      expect(RequestAuth.isValidKey('other')).toBe(false);
      RequestAuth.setApiKeyProvider(() => undefined);
    });
  });
});
