/**
 * Process-wide TLS verification policy.
 *
 * Historically every outbound request hard-coded `rejectUnauthorized: false`,
 * which silently disabled certificate validation regardless of the user's
 * `security.verifySslCertificates` setting. This module centralises that flag
 * so all downloaders / probes honour the user's choice.
 *
 * The default is `true` (verify certificates) — secure by default. It is
 * seeded from persisted settings at startup and kept in sync whenever settings
 * change.
 */
export class TlsPolicy {
  private static verifySslCertificates = true;

  public static setVerifySslCertificates(value: boolean): void {
    TlsPolicy.verifySslCertificates = value !== false;
  }

  public static getVerifySslCertificates(): boolean {
    return TlsPolicy.verifySslCertificates;
  }

  /** `rejectUnauthorized` value to pass to Node TLS options. */
  public static rejectUnauthorized(): boolean {
    return !TlsPolicy.verifySslCertificates;
  }
}
