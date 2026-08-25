import * as path from 'path';
import * as fs from 'fs';

/**
 * Path traversal defence for endpoints that accept a `filePath` and perform
 * filesystem reads/writes (metadata injection, archive analysis, cloud upload,
 * vault store/export, auto-extraction, transcode, …).
 *
 * These operations are restricted to a configurable set of "allowed roots"
 * (the default download directory, per-category destinations, queue
 * destinations, and storage pools). Attempts to touch files outside those
 * roots are rejected.
 */
export class PathGuard {
  private static allowedRoots: string[] = [];
  private static allowAnywhere = false;

  /** Replace the allowed-root set (absolute, resolved paths). */
  public static setAllowedRoots(roots: string[]): void {
    PathGuard.allowedRoots = roots
      .filter((r) => r && typeof r === 'string' && r.trim().length > 0)
      .map((r) => path.resolve(r.trim()));
  }

  /** Test hook / escape hatch. */
  public static setAllowAnywhere(value: boolean): void {
    PathGuard.allowAnywhere = value;
  }

  public static getAllowedRoots(): string[] {
    return [...PathGuard.allowedRoots];
  }

  private static getCanonicalPath(target: string): string {
    const resolved = path.resolve(target);
    try {
      if (fs.existsSync(resolved)) {
        return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
      }
      // If path does not exist yet, resolve the nearest existing ancestor
      let cur = path.dirname(resolved);
      while (cur && cur !== path.dirname(cur)) {
        if (fs.existsSync(cur)) {
          const realCur = fs.realpathSync.native ? fs.realpathSync.native(cur) : fs.realpathSync(cur);
          const rel = path.relative(cur, resolved);
          return path.join(realCur, rel);
        }
        cur = path.dirname(cur);
      }
    } catch {}
    return resolved;
  }

  /** Resolve and validate a caller-supplied local path. Throws on violation. */
  public static assertSafeLocalPath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('A file path is required');
    }

    if (filePath.includes('\0')) {
      throw new Error('Invalid path: null bytes are prohibited');
    }

    const resolved = path.resolve(filePath);

    if (PathGuard.allowAnywhere || PathGuard.allowedRoots.length === 0) {
      return resolved;
    }

    const canonicalPath = this.getCanonicalPath(resolved);
    const isWindows = process.platform === 'win32';
    const normCanonical = isWindows ? canonicalPath.toLowerCase() : canonicalPath;

    const inside = PathGuard.allowedRoots.some((root) => {
      const canonicalRoot = this.getCanonicalPath(root);
      const normRoot = isWindows ? canonicalRoot.toLowerCase() : canonicalRoot;
      return normCanonical === normRoot || normCanonical.startsWith(normRoot + path.sep);
    });

    if (!inside) {
      throw new Error(
        `Path "${resolved}" is outside the permitted directories. ` +
          `Only files under your download folders can be accessed.`
      );
    }

    return resolved;
  }
}
