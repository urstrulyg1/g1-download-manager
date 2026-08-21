import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface VaultItem {
  id: string;
  originalFilename: string;
  vaultFilePath: string;
  fileSizeBytes: number;
  encryptedAt: number;
}

interface VaultMeta {
  version: number;
  salt: string; // hex — random per vault
  keyCheck: string; // hex — HMAC proving the password is correct
  items: VaultItem[];
}

/**
 * AES-256-GCM encrypted vault.
 *
 * Hardening over the original implementation:
 * - Random per-vault salt (previously a hard-coded static salt).
 * - Password verification via an HMAC key-check blob — unlockVault() now
 *   actually REJECTS wrong passwords instead of silently accepting any input
 *   and later producing garbage decryptions.
 * - The item index is persisted to disk, so vault contents survive restarts.
 */
export class EncryptedVault {
  private static vaultDir = path.join(process.cwd(), 'resources', 'vault');
  private static metaPath = path.join(EncryptedVault.vaultDir, 'vault.meta.json');
  private static isUnlocked = false;
  private static activeKey: Buffer | null = null;
  private static items: Map<string, VaultItem> = new Map();

  /** Test hook: relocate the vault directory. */
  public static setVaultDir(dir: string): void {
    this.vaultDir = dir;
    this.metaPath = path.join(dir, 'vault.meta.json');
    this.lockVault();
    this.items.clear();
  }

  public static unlockVault(password: string): boolean {
    if (!password || password.length === 0) return false;

    fs.mkdirSync(this.vaultDir, { recursive: true });
    let meta = this.readMeta();

    if (!meta) {
      // First unlock — initialize the vault with a fresh random salt.
      const salt = crypto.randomBytes(32);
      const key = this.deriveKey(password, salt);
      meta = {
        version: 2,
        salt: salt.toString('hex'),
        keyCheck: this.computeKeyCheck(key),
        items: [],
      };
      this.writeMeta(meta);
      this.activeKey = key;
      this.isUnlocked = true;
      this.items.clear();
      return true;
    }

    const key = this.deriveKey(password, Buffer.from(meta.salt, 'hex'));
    const expected = Buffer.from(meta.keyCheck, 'hex');
    const actual = Buffer.from(this.computeKeyCheck(key), 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return false; // wrong master password
    }

    this.activeKey = key;
    this.isUnlocked = true;
    this.items = new Map(meta.items.map((i) => [i.id, i]));
    return true;
  }

  public static lockVault(): void {
    this.isUnlocked = false;
    if (this.activeKey) this.activeKey.fill(0);
    this.activeKey = null;
  }

  public static isVaultUnlocked(): boolean {
    return this.isUnlocked;
  }

  public static async encryptAndStoreFile(sourceFilePath: string): Promise<VaultItem> {
    if (!this.isUnlocked || !this.activeKey) {
      throw new Error('Vault is locked. Unlock vault first.');
    }
    if (!fs.existsSync(sourceFilePath)) {
      throw new Error(`Source file does not exist: ${sourceFilePath}`);
    }

    fs.mkdirSync(this.vaultDir, { recursive: true });

    const id = `v_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const originalFilename = path.basename(sourceFilePath);
    const vaultFilePath = path.join(this.vaultDir, `${id}.enc`);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.activeKey, iv);

    const fileData = fs.readFileSync(sourceFilePath);
    const encryptedData = Buffer.concat([cipher.update(fileData), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Store IV (16) + AuthTag (16) + Encrypted Data
    const payload = Buffer.concat([iv, authTag, encryptedData]);
    fs.writeFileSync(vaultFilePath, payload);

    const vaultItem: VaultItem = {
      id,
      originalFilename,
      vaultFilePath,
      fileSizeBytes: fileData.length,
      encryptedAt: Date.now(),
    };

    this.items.set(id, vaultItem);
    this.persistItems();
    return vaultItem;
  }

  public static async decryptAndExportFile(vaultItemId: string, outputDir: string): Promise<string> {
    if (!this.isUnlocked || !this.activeKey) {
      throw new Error('Vault is locked. Unlock vault first.');
    }

    const item = this.items.get(vaultItemId);
    if (!item) throw new Error('Vault item not found');

    if (!fs.existsSync(item.vaultFilePath)) {
      throw new Error('Encrypted file missing from vault storage');
    }

    const payload = fs.readFileSync(item.vaultFilePath);
    const iv = payload.subarray(0, 16);
    const authTag = payload.subarray(16, 32);
    const encryptedData = payload.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.activeKey, iv);
    decipher.setAuthTag(authTag);

    const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    fs.mkdirSync(outputDir, { recursive: true });
    const targetPath = path.join(outputDir, item.originalFilename);
    fs.writeFileSync(targetPath, decryptedData);

    return targetPath;
  }

  public static getVaultItems(): VaultItem[] {
    return Array.from(this.items.values());
  }

  // ------------------------------------------------------------ internals

  private static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256');
  }

  private static computeKeyCheck(key: Buffer): string {
    return crypto.createHmac('sha256', key).update('g1dm-vault-keycheck-v2').digest('hex');
  }

  private static readMeta(): VaultMeta | null {
    try {
      if (!fs.existsSync(this.metaPath)) return null;
      return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')) as VaultMeta;
    } catch {
      return null;
    }
  }

  private static writeMeta(meta: VaultMeta): void {
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
  }

  private static persistItems(): void {
    const meta = this.readMeta();
    if (!meta) return;
    meta.items = Array.from(this.items.values());
    this.writeMeta(meta);
  }
}
