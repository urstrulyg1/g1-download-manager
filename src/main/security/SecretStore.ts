import * as crypto from 'crypto';
import * as os from 'os';

export class SecretStore {
  private static masterKey: Buffer | null = null;

  private static getDerivedKey(): Buffer {
    if (!this.masterKey) {
      const machineIdentity = `${os.hostname()}_${os.userInfo().username}_${os.platform()}_g1dm_secure_vault_v1`;
      this.masterKey = crypto.scryptSync(machineIdentity, 'g1dm_salt_key_2026_idm_secure', 32);
    }
    return this.masterKey;
  }

  public static encryptSecret(plaintext: string): string {
    if (!plaintext) return '';
    const key = this.getDerivedKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public static decryptSecret(encryptedPayload: string): string {
    if (!encryptedPayload || !encryptedPayload.includes(':')) return encryptedPayload;
    try {
      const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
      if (!ivHex || !authTagHex || !encryptedHex) return encryptedPayload;

      const key = this.getDerivedKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  public static redactString(input: string): string {
    if (!input) return input;
    // Redact password=, token=, authorization: Bearer, etc.
    return input
      .replace(/(password=["']?)([^"'\s&]+)(["']?)/gi, '$1***REDACTED***$3')
      .replace(/(token=["']?)([^"'\s&]+)(["']?)/gi, '$1***REDACTED***$3')
      .replace(/(bearer\s+)([a-zA-Z0-9._-]+)/gi, '$1***REDACTED***')
      .replace(/(basic\s+)([a-zA-Z0-9+/=]+)/gi, '$1***REDACTED***');
  }
}
