import * as path from 'path';
import * as fs from 'fs';

export class PathSanitizer {
  private static readonly WINDOWS_RESERVED_NAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
  ]);

  public static sanitizeFilename(rawName: string, fallback: string = 'download'): string {
    if (!rawName || typeof rawName !== 'string') return fallback;

    // 0. Safely decode URL / percent-encoded sequences (handles %2e%2e, %2f, %00, double-encoded)
    let name = rawName;
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(name);
        if (decoded === name) break;
        name = decoded;
      } catch {
        break;
      }
    }

    // 1. Unicode NFC normalization
    name = name.normalize('NFC').trim();

    // 1.1 Remove null bytes and control characters immediately
    name = name.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

    // 1.2 Normalize Unicode slash / backslash lookalikes to standard forward slashes
    name = name.replace(/[\u2215\u2044\u29f8\uff0f\u29f9\u29f5\u20e5\uff3c]/g, '/');

    // 2. Strip URL query & hashes if present
    name = name.split('?')[0].split('#')[0];

    // 2.1 Normalize Windows backslashes to forward slashes before path.basename
    name = name.replace(/\\/g, '/');

    // 3. Extract basename
    name = path.basename(name);

    // 4. Remove illegal filesystem characters
    name = name.replace(/[/\\?%*:|"<>]/g, '_');

    // 4.1 Strip trailing dots and spaces first (Windows auto-truncates these)
    name = name.replace(/[. ]+$/, '');

    // 4.2 Remove multiple consecutive dots to prevent dot traversal attacks
    name = name.replace(/\.{2,}/g, '_');

    // 5. Final cleanup of trailing dots, spaces, or resulting underscores
    name = name.replace(/[. _]+$/, '').trim();

    // 6. Check Windows reserved device names
    const nameWithoutExt = name.split('.')[0].toLowerCase();
    if (this.WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
      name = `_${name}`;
    }

    // 7. Prevent hidden dot files, reserved empty names, or invalid names
    if (!name || name === '.' || name === '..' || name === '_') {
      name = fallback;
    }

    // 8. Truncate to maximum 240 chars to avoid filesystem max length limit
    if (name.length > 240) {
      const ext = path.extname(name);
      name = `${name.slice(0, 230)}${ext}`;
    }

    return name;
  }

  public static isPathInsideDirectory(targetPath: string, parentDir: string): boolean {
    if (!targetPath || !parentDir) return false;
    if (targetPath.includes('\0') || parentDir.includes('\0')) return false;

    let resolvedTarget = path.resolve(targetPath);
    let resolvedParent = path.resolve(parentDir);

    // If paths exist on disk, canonicalize via realpath to protect against symlink escapes
    try {
      if (fs.existsSync(resolvedParent)) {
        resolvedParent = fs.realpathSync.native ? fs.realpathSync.native(resolvedParent) : fs.realpathSync(resolvedParent);
      }
      if (fs.existsSync(resolvedTarget)) {
        resolvedTarget = fs.realpathSync.native ? fs.realpathSync.native(resolvedTarget) : fs.realpathSync(resolvedTarget);
      } else {
        // If target does not exist yet, canonicalize its nearest existing parent
        let cur = path.dirname(resolvedTarget);
        while (cur && cur !== path.dirname(cur)) {
          if (fs.existsSync(cur)) {
            const realCur = fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur);
            const rel = path.relative(cur, resolvedTarget);
            resolvedTarget = path.join(realCur, rel);
            break;
          }
          cur = path.dirname(cur);
        }
      }
    } catch {
      // Fallback to lexical resolve
    }

    const isWindows = process.platform === 'win32';
    const normTarget = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const normParent = isWindows ? resolvedParent.toLowerCase() : resolvedParent;

    return normTarget === normParent || normTarget.startsWith(normParent + path.sep);
  }

  public static ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
