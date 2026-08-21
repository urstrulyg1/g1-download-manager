import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * API authentication for the control plane.
 *
 * The server binds to 0.0.0.0 by default (LAN / Tailscale / mobile PWA access).
 * This middleware:
 *
 *  - Always allows requests originating from loopback (127.0.0.1 / ::1) — the
 *    local web UI and the companion browser extension live there.
 *  - When an API key is configured (via the `G1DM_API_KEY` environment variable
 *    or the persisted `security.apiKey` setting), REQUIRES that key on every
 *    non-loopback request (constant-time comparison).
 *  - When no key is configured, non-loopback access remains open — matching the
 *    documented LAN access model — but the server logs a prominent warning
 *    recommending that a key be set.
 *
 * See `isRemoteAuthEnabled()` to determine whether a key is currently enforced.
 */
export class RequestAuth {
  private static apiKeyProvider: (() => string | undefined) | null = null;

  /** Register a function that returns the currently-configured API key. */
  public static setApiKeyProvider(provider: () => string | undefined): void {
    RequestAuth.apiKeyProvider = provider;
  }

  public static getApiKey(): string | undefined {
    const envKey = process.env.G1DM_API_KEY;
    if (envKey && envKey.trim().length > 0) return envKey.trim();
    if (RequestAuth.apiKeyProvider) {
      const key = RequestAuth.apiKeyProvider();
      if (key && key.trim().length > 0) return key.trim();
    }
    return undefined;
  }

  private static isLoopback(req: Request): boolean {
    const remote = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return remote === '127.0.0.1' || remote === '::1' || remote === 'localhost';
  }

  private static extractBearer(req: Request): string | undefined {
    const auth = req.headers['authorization'];
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice('bearer '.length).trim();
    }
    const key = req.headers['x-g1dm-key'];
    if (key) return String(key).trim();
    return undefined;
  }

  /** Constant-time comparison of a supplied key against the configured key. */
  public static isValidKey(supplied: string): boolean {
    const key = RequestAuth.getApiKey();
    if (!key || !supplied) return false;
    const a = Buffer.from(supplied);
    const b = Buffer.from(key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** True when non-loopback requests are currently gated behind an API key. */
  public static isRemoteAuthEnabled(): boolean {
    return RequestAuth.getApiKey() !== undefined;
  }

  public static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Local UI + extension access requires no key.
      if (RequestAuth.isLoopback(req)) {
        return next();
      }

      // No key configured → remote access remains open (documented LAN model).
      const key = RequestAuth.getApiKey();
      if (!key) {
        return next();
      }

      const supplied = RequestAuth.extractBearer(req);
      if (!supplied) {
        return res.status(401).json({ error: 'Missing API key. Use "Authorization: Bearer <key>".' });
      }

      if (!RequestAuth.isValidKey(supplied)) {
        return res.status(401).json({ error: 'Invalid API key.' });
      }

      return next();
    };
  }
}
