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

export class EncryptedVault {
  private static vaultDir = path.join(process.cwd(), 'resources', 'vault');
  private static isUnlocked = false;
  private static activeKey: Buffer | null = null;
  private static items: Map<string, VaultItem> = new Map();

  public static unlockVault(password: string): boolean {
    const salt = Buffer.from('g1dm_vault_salt_v1', 'utf-8');
    this.activeKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    this.isUnlocked = true;
    return true;
  }

  public static lockVault(): void {
    this.isUnlocked = false;
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

    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }

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

    const targetPath = path.join(outputDir, item.originalFilename);
    fs.writeFileSync(targetPath, decryptedData);

    return targetPath;
  }

  public static getVaultItems(): VaultItem[] {
    return Array.from(this.items.values());
  }
}
