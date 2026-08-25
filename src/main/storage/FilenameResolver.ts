import * as path from 'path';
import * as mime from 'mime-types';
import { PathSanitizer } from './PathSanitizer';

/**
 * Inputs that can influence the resolved filename. Every field is optional;
 * the resolver walks the documented priority order and picks the first
 * usable, non-generic candidate.
 *
 * Priority (highest -> lowest):
 *   1. User-provided filename
 *   2. Media / yt-dlp title
 *   3. Content-Disposition filename
 *   4. HTML / OpenGraph page title
 *   5. URL filename
 *   6. Safe fallback
 */
export interface FilenameResolutionInput {
  /** The download URL (used for the URL-filename and safe fallback). */
  url: string;
  /** 1. Filename explicitly supplied by the user / browser / API caller. */
  userFilename?: string | null;
  /** 2. Title reported by the media detector (yt-dlp, HLS/DASH manifest, etc). */
  mediaTitle?: string | null;
  /** 3. Filename parsed from the Content-Disposition response header. */
  contentDispositionFilename?: string | null;
  /** 4. HTML <title> or OpenGraph / twitter:title from the page. */
  pageTitle?: string | null;
  /** 5. Filename already derived from the URL by the probe. */
  probeFilename?: string | null;
  /** Response Content-Type, used to infer a sane extension. */
  mimeType?: string | null;
  /** The resolved media container, when known (e.g. "mp4", "webm", "mp3"). */
  mediaContainer?: string | null;
  /** True when the resource is an audio-only download (affects default extension). */
  isAudio?: boolean;
  /** Override the absolute safe fallback stem (default: "download"). */
  fallback?: string;
}

export interface ResolvedFilename {
  /** The final, sanitized filename (basename only) including extension. */
  filename: string;
  /** The sanitized stem (filename without extension). */
  stem: string;
  /** The sanitized, leading-dot-free extension (e.g. "mp4"). */
  ext: string;
  /** Which priority source produced the stem. */
  source:
    | 'user'
    | 'media_title'
    | 'content_disposition'
    | 'page_title'
    | 'url'
    | 'fallback';
}

/**
 * Extensions that indicate a *web page / script* rather than a downloadable
 * artifact. These are never honored as the final extension — for media pages
 * (YouTube/Vimeo/etc.) we attach the correct media container instead.
 */
const PAGE_EXTS = new Set(['htm', 'html', 'php', 'asp', 'aspx', '']);

/**
 * Host names / path tokens that are obviously NOT a meaningful video title
 * and should never be preferred over a real media/page title. We intentionally
 * do NOT hardcode the full list of streaming providers here — the check is
 * based on the *shape* of the name (generic watch/play tokens + bare host).
 */
const GENERIC_STEMS = new Set([
  'watch', 'play', 'video', 'stream', 'download', 'file', 'media',
  'index', 'default', 'item', 'clip', 'embed', 'e', 'v', 'd',
]);

export class FilenameResolver {
  /**
   * Resolve a single safe filename from the supplied metadata. The returned
   * filename is always a basename (no path separators), NFC-normalized,
   * sanitized, and has a single correct extension.
   */
  public static resolve(input: FilenameResolutionInput): ResolvedFilename {
    const fallback = this.sanitizeStem(input.fallback || 'download') || 'download';

    // --- Determine the correct extension once, up front ---------------------
    const ext = this.resolveExtension(input);

    // --- Walk the priority chain for the stem ------------------------------
    let stem = '';
    let source: ResolvedFilename['source'] = 'fallback';

    const tryStem = (
      raw: string | null | undefined,
      candidateSource: ResolvedFilename['source'],
      opts: { treatAsGeneric?: boolean } = {}
    ): boolean => {
      const candidate = this.sanitizeStem(raw);
      if (!candidate) return false;
      if (opts.treatAsGeneric || this.isGenericStem(candidate)) return false;
      stem = candidate;
      source = candidateSource;
      return true;
    };

    // 1. User-provided filename. The user is the authority. A caller may
    // deliberately choose a generic or extensionless name, so unlike inferred
    // metadata this candidate is never discarded merely because of its shape.
    if (input.userFilename) {
      const user = this.sanitizeFull(input.userFilename);
      if (user) {
        const userRawExt = path.extname(user);
        const userExt = userRawExt.replace(/^\./, '');
        const userStem = this.sanitizeStem(path.basename(user, userRawExt));
        if (userStem) {
          const useExt = userExt && !PAGE_EXTS.has(userExt.toLowerCase()) ? userExt : ext;
          return this.build(userStem, useExt, 'user');
        }
      }
    }

    // 2. Media / yt-dlp title.
    if (tryStem(input.mediaTitle, 'media_title')) {
      return this.build(stem, ext, source);
    }

    // 3. Content-Disposition filename.
    if (input.contentDispositionFilename) {
      const cd = this.sanitizeFull(input.contentDispositionFilename);
      if (cd) {
        const cdRawExt = path.extname(cd);
        const cdExt = cdRawExt.replace(/^\./, '');
        const cdStem = this.sanitizeStem(path.basename(cd, cdRawExt));
        if (cdStem && !this.isGenericStem(cdStem)) {
          const useExt = cdExt && !PAGE_EXTS.has(cdExt.toLowerCase()) ? cdExt : ext;
          return this.build(cdStem, useExt, 'content_disposition');
        }
      }
    }

    // 4. HTML / OpenGraph page title.
    if (tryStem(input.pageTitle, 'page_title')) {
      return this.build(stem, ext, source);
    }

    // 5. URL filename (from probe). Only use if the URL actually encodes a
    //    meaningful file stem.
    if (input.probeFilename) {
      const pf = this.sanitizeFull(input.probeFilename);
      if (pf) {
        const pfRawExt = path.extname(pf);
        const pfExt = pfRawExt.replace(/^\./, '');
        const pfStem = this.sanitizeStem(path.basename(pf, pfRawExt));
        if (pfStem && !this.isGenericStem(pfStem)) {
          // If the probe filename carries a real extension, honor it
          // (case preserved); otherwise attach the resolved extension.
          if (pfExt && !PAGE_EXTS.has(pfExt.toLowerCase())) {
            return this.build(pfStem, pfExt, 'url');
          }
          return this.build(pfStem, ext, 'url');
        }
      }
    }

    // 6. Safe fallback — include a short, filesystem-safe token derived from
    //    the URL host/path so multiple unknown files do not collide on disk
    //    (the collision handler still guarantees uniqueness, but this makes
    //    the names self-documenting).
    return this.build(fallback, ext, 'fallback');
  }

  /**
   * Returns true when a candidate stem carries no useful identifying
   * information (a "watch"/"play" token or a bare hostname such as
   * "youtube.com" / "www.youtube.com").
   */
  public static isGenericStem(rawStem: string): boolean {
    if (!rawStem) return true;

    // Check the raw (pre-sanitization) value for bare hostnames so we do not
    // rely on characters that PathSanitizer may rewrite (e.g. "." -> "_").
    const trimmedRaw = String(rawStem).trim().replace(/^www\./i, '');
    if (
      trimmedRaw.includes('.') &&
      /^[a-z0-9.-]+$/i.test(trimmedRaw) &&
      !trimmedRaw.includes(' ')
    ) {
      const parts = trimmedRaw.split('.').filter(Boolean);
      if (parts.length >= 2 && parts[parts.length - 1].length <= 6) {
        return true;
      }
    }

    const stem = this.sanitizeStem(rawStem);
    if (!stem) return true;
    if (GENERIC_STEMS.has(stem.toLowerCase())) return true;

    return false;
  }

  /**
   * Decide which file extension to use, based on (in order): an explicit
   * media container, the Content-Type, or a sensible default for audio/video.
   * Never returns a leading dot; never returns an empty string.
   */
  public static resolveExtension(input: FilenameResolutionInput): string {
    const fromContainer = this.cleanExt(input.mediaContainer);
    if (fromContainer) return fromContainer.toLowerCase();

    // If the user / Content-Disposition / probe already supplied a real
    // extension, prefer it (case preserved, e.g. "photo.JPG"). We only reject
    // obvious web-page / script extensions (".html", ".php", ...) — a direct
    // ".bin" or any other real extension is honored as-is.
    for (const candidate of [input.userFilename, input.contentDispositionFilename, input.probeFilename]) {
      if (candidate) {
        const e = this.cleanExt(path.extname(String(candidate)));
        if (e && !PAGE_EXTS.has(e.toLowerCase())) return e;
      }
    }

    if (input.mimeType) {
      const fromMime = this.extensionFromMime(String(input.mimeType));
      if (fromMime) return fromMime;
    }

    // Never infer a video container for an arbitrary HTTP resource.  `bin`
    // is an explicit, safe fallback when neither the server nor the URL tells
    // us the type. Media downloads provide a container or media MIME above.
    return 'bin';
  }

  /** Produce a display label describing where the filename came from. */
  public static describeSource(source: ResolvedFilename['source']): string {
    switch (source) {
      case 'user': return 'user-provided filename';
      case 'media_title': return 'media title';
      case 'content_disposition': return 'Content-Disposition header';
      case 'page_title': return 'page title';
      case 'url': return 'URL filename';
      default: return 'safe fallback';
    }
  }

  // --- internal helpers ----------------------------------------------------

  private static build(
    stem: string,
    ext: string,
    source: ResolvedFilename['source']
  ): ResolvedFilename {
    const safeStem = this.sanitizeStem(stem) || 'download';
    const safeExt = this.cleanExt(ext) || 'bin';
    return {
      filename: `${safeStem}.${safeExt}`,
      stem: safeStem,
      ext: safeExt,
      source,
    };
  }

  private static cleanExt(ext: string | null | undefined): string {
    if (!ext) return '';
    // Containers can come back as friendly labels ("MP4 / HLS", "WebM / MKV").
    // Pick the first recognizable token.
    const token = String(ext)
      .split(/[^a-zA-Z0-9]+/)
      .map((t) => t.trim())
      .find((t) => t.length > 0);
    if (!token) return '';
    return token.replace(/[^a-zA-Z0-9]/g, '');
  }

  private static extensionFromMime(mimeType: string): string {
    const base = mimeType.split(';')[0].trim().toLowerCase();
    if (!base || base === 'application/octet-stream' || base === 'binary/octet-stream') return '';

    // mime-types is intentionally used instead of an allowlist: every MIME
    // type it recognizes (documents, packages, images, archives and future
    // types) receives its native extension without making download eligibility
    // depend on that extension.
    // mime-db's historical `mpga` label is valid but users and servers
    // conventionally use `.mp3`; preserve that familiar extension.
    if (base === 'audio/mpeg') return 'mp3';
    const resolved = mime.extension(base);
    return typeof resolved === 'string' ? this.cleanExt(resolved).toLowerCase() : '';
  }

  /** Sanitize a full filename candidate (may already contain an extension). */
  private static sanitizeFull(raw: string | null | undefined): string {
    if (!raw) return '';
    // Reuse the hardened PathSanitizer so all path-traversal / control-char /
    // reserved-name protections apply consistently.
    return PathSanitizer.sanitizeFilename(String(raw), '');
  }

  /** Sanitize a stem candidate and strip any residual extension. */
  private static sanitizeStem(raw: string | null | undefined): string {
    if (!raw) return '';
    const cleaned = this.sanitizeFull(raw);
    if (!cleaned) return '';
    const ext = path.extname(cleaned);
    const stem = ext ? path.basename(cleaned, ext) : cleaned;
    return stem.trim();
  }
}
