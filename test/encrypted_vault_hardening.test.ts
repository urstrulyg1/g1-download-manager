import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EncryptedVault } from '../src/main/security/EncryptedVault';

describe('EncryptedVault — hardened master password handling', () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1dm-vault-'));
    vaultDir = path.join(tmpDir, 'vault');
    EncryptedVault.setVaultDir(vaultDir);
  });

  afterEach(() => {
    EncryptedVault.lockVault();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes the vault on first unlock and accepts the same password again', () => {
    expect(EncryptedVault.unlockVault('correct-horse-battery')).toBe(true);
    EncryptedVault.lockVault();
    expect(EncryptedVault.unlockVault('correct-horse-battery')).toBe(true);
  });

  it('REJECTS a wrong master password (regression: previously any password unlocked)', () => {
    expect(EncryptedVault.unlockVault('original-password')).toBe(true);
    EncryptedVault.lockVault();
    expect(EncryptedVault.unlockVault('wrong-password')).toBe(false);
    expect(EncryptedVault.isVaultUnlocked()).toBe(false);
  });

  it('rejects empty passwords', () => {
    expect(EncryptedVault.unlockVault('')).toBe(false);
  });

  it('uses a random per-vault salt (two vaults with the same password differ)', () => {
    EncryptedVault.unlockVault('same-password');
    const meta1 = JSON.parse(fs.readFileSync(path.join(vaultDir, 'vault.meta.json'), 'utf8'));

    const otherDir = path.join(tmpDir, 'vault2');
    EncryptedVault.setVaultDir(otherDir);
    EncryptedVault.unlockVault('same-password');
    const meta2 = JSON.parse(fs.readFileSync(path.join(otherDir, 'vault.meta.json'), 'utf8'));

    expect(meta1.salt).not.toBe(meta2.salt);
    expect(meta1.keyCheck).not.toBe(meta2.keyCheck);
  });

  it('round-trips encrypt → lock → unlock → decrypt with the item index persisted', async () => {
    EncryptedVault.unlockVault('vault-pass-42');

    const secretPath = path.join(tmpDir, 'secret.txt');
    fs.writeFileSync(secretPath, 'top secret payload');
    const item = await EncryptedVault.encryptAndStoreFile(secretPath);

    // Ciphertext on disk must not contain the plaintext
    const cipher = fs.readFileSync(item.vaultFilePath);
    expect(cipher.includes(Buffer.from('top secret payload'))).toBe(false);

    // Simulate restart: lock, reset in-memory state via re-unlock
    EncryptedVault.lockVault();
    expect(EncryptedVault.unlockVault('vault-pass-42')).toBe(true);
    expect(EncryptedVault.getVaultItems().length).toBe(1);

    const outDir = path.join(tmpDir, 'out');
    const exported = await EncryptedVault.decryptAndExportFile(item.id, outDir);
    expect(fs.readFileSync(exported, 'utf8')).toBe('top secret payload');
  });

  it('refuses to store files while locked', async () => {
    const f = path.join(tmpDir, 'f.txt');
    fs.writeFileSync(f, 'x');
    await expect(EncryptedVault.encryptAndStoreFile(f)).rejects.toThrow(/locked/i);
  });
});
