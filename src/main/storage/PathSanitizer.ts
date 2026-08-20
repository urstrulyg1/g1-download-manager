import * as path from 'path';
import * as fs from 'fs';

export class PathSanitizer {
  private static readonly WINDOWS_RESERVED_NAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
  ]);

  public static sanitizeFilename(rawName: string, fallback: string = 'download'): string {
    if (!rawName) return fallback;

    // 1. Unicode NFC normalization
    let name = rawName.normalize('NFC').trim();

    // 2. Strip URL query & hashes if present
    name = name.split('?')[0].split('#')[0];

    // 2.1 Normalize Windows backslashes to forward slashes before path.basename
    name = name.replace(/\\/g, '/');

    // 3. Extract basename
    name = path.basename(name);

    // 4. Remove illegal filesystem characters
    name = name.replace(/[/\\?%*:|"<>]/g, '_');

    // 4.1 Remove multiple consecutive dots to prevent dot traversal attacks
    name = name.replace(/\.{2,}/g, '_');

    // 5. Remove control characters
    name = name.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

    // 6. Check Windows reserved device names
    const nameWithoutExt = name.split('.')[0].toLowerCase();
    if (this.WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
      name = `_${name}`;
    }

    // 7. Prevent hidden dot files or empty names
    if (!name || name === '.' || name === '..') {
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
    const resolvedTarget = path.resolve(targetPath);
    const resolvedParent = path.resolve(parentDir);
    return resolvedTarget.startsWith(resolvedParent);
  }

  public static ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
