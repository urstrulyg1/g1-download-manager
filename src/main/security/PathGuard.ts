import * as path from 'path';

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

  /** Resolve and validate a caller-supplied local path. Throws on violation. */
  public static assertSafeLocalPath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('A file path is required');
    }

    const resolved = path.resolve(filePath);

    if (PathGuard.allowAnywhere || PathGuard.allowedRoots.length === 0) {
      return resolved;
    }

    const inside = PathGuard.allowedRoots.some((root) => {
      return resolved === root || resolved.startsWith(root + path.sep);
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
