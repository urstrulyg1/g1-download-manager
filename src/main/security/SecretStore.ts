import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * At-rest encryption for secrets (download credentials, proxy passwords, …).
 *
 * The previous implementation derived the AES key from publicly-knowable
 * values (hostname + username + platform), which any local process could
 * reproduce. This version uses a random 256-bit master key persisted to
 * `~/.g1dm/secret.key` (mode 0600), so it is not derivable from public info.
 *
 * Existing records encrypted with the legacy deterministic key are still
 * decryptable via a fallback path.
 */
export class SecretStore {
  private static masterKey: Buffer | null = null;
  private static legacyKey: Buffer | null = null;

  private static dataDir(): string {
    const dir = path.join(process.env.HOME || os.homedir() || '/tmp', '.g1dm');
    return dir;
  }

  private static keyPath(): string {
    return path.join(SecretStore.dataDir(), 'secret.key');
  }

  private static getMasterKey(): Buffer {
    if (SecretStore.masterKey) return SecretStore.masterKey;

    try {
      fs.mkdirSync(SecretStore.dataDir(), { recursive: true });
      if (fs.existsSync(SecretStore.keyPath())) {
        const existing = fs.readFileSync(SecretStore.keyPath());
        if (existing.length === 32) {
          SecretStore.masterKey = existing;
          return SecretStore.masterKey;
        }
      }
      SecretStore.masterKey = crypto.randomBytes(32);
      fs.writeFileSync(SecretStore.keyPath(), SecretStore.masterKey, { mode: 0o600 });
      return SecretStore.masterKey;
    } catch {
      // Could not read/write the key file (read-only FS, etc.) — fall back to
      // the legacy deterministic key rather than failing outright.
      return SecretStore.getLegacyKey();
    }
  }

  private static getLegacyKey(): Buffer {
    if (!SecretStore.legacyKey) {
      const machineIdentity = `${os.hostname()}_${os.userInfo().username}_${os.platform()}_g1dm_secure_vault_v1`;
      SecretStore.legacyKey = crypto.scryptSync(machineIdentity, 'g1dm_salt_key_2026_idm_secure', 32);
    }
    return SecretStore.legacyKey;
  }

  public static encryptSecret(plaintext: string): string {
    if (!plaintext) return '';
    return SecretStore.encryptWithKey(plaintext, SecretStore.getMasterKey());
  }

  public static decryptSecret(encryptedPayload: string): string {
    if (!encryptedPayload || !encryptedPayload.includes(':')) return encryptedPayload;

    // Try the current master key first, then the legacy key (for records
    // encrypted before the key-store migration).
    const current = SecretStore.decryptWithKey(encryptedPayload, SecretStore.getMasterKey());
    if (current !== '') return current;

    const legacy = SecretStore.decryptWithKey(encryptedPayload, SecretStore.getLegacyKey());
    return legacy;
  }

  private static encryptWithKey(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private static decryptWithKey(encryptedPayload: string, key: Buffer): string {
    try {
      const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
      if (!ivHex || !authTagHex || !encryptedHex) return '';

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
